import type {
  Cita,
  Cliente,
  Consentimientos,
  Db,
  EstadoCita,
  ID,
  Llavero,
  OrigenCita,
  TipoMensaje,
} from './types';
import { store } from './store';
import { codigoCorto, siguienteCodigoCliente, tokenLlavero, uid } from './ids';
import { addDays, startOfDay } from './format';
import { sillaLibre, sillasDe } from './derive';
import { haySupabase } from './supabase';
import * as repo from './repo';
import { salirRemoto } from './acceso';
import { toast } from '../components/ui';

/* ------------------------------------------------------------------ */
/* Puente entre el modo local y el real                                */
/* ------------------------------------------------------------------ */

/** Tras escribir en Postgres se relee el local para que la pantalla no mienta. */
async function refrescar(): Promise<void> {
  const db = await repo.cargarTodo();
  if (db) store.hidratar(db);
}

function aviso(e: unknown, contexto: string): void {
  toast(e instanceof Error ? e.message : `No se pudo ${contexto}.`, 'aviso');
}

/** Envuelve una escritura remota: nunca deja una promesa rechazada suelta. */
async function intentar<T>(fn: () => Promise<T>, contexto: string): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    aviso(e, contexto);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

export function entrar(barberoId?: ID): void {
  if (haySupabase) return;
  store.mutate((db) => {
    const barbero = barberoId ? db.barberos.find((b) => b.id === barberoId) : db.barberos[0];
    if (!barbero) return;
    db.sesion = { barberoId: barbero.id, barberiaId: barbero.barberiaId };
  });
}

export async function salir(): Promise<void> {
  if (haySupabase) {
    await salirRemoto();
    return;
  }
  store.mutate((db) => {
    db.sesion = null;
  });
}

/* ------------------------------------------------------------------ */
/* Eventos (preparados para automatizaciones)                          */
/* ------------------------------------------------------------------ */

function evento(
  db: Db,
  tipo: Db['eventos'][number]['tipo'],
  barberiaId: ID,
  clienteId?: ID,
  meta?: Record<string, string | number | boolean>,
) {
  db.eventos.push({ id: uid('ev'), barberiaId, tipo, clienteId, fecha: new Date().toISOString(), meta });
}

export async function registrarToque(llaveroId: ID, clienteId: ID): Promise<void> {
  if (haySupabase) {
    const llavero = store.read().llaveros.find((l) => l.id === llaveroId);
    if (!llavero) return;
    await intentar(
      () =>
        repo.insertarEvento({
          barberiaId: llavero.barberiaId,
          clienteId,
          tipo: 'cliente_identificado_nfc',
          meta: { llavero: llavero.codigoCorto },
        }),
      'registrar el toque',
    );
    return;
  }
  store.mutate((db) => {
    const l = db.llaveros.find((x) => x.id === llaveroId);
    if (!l) return;
    evento(db, 'cliente_identificado_nfc', l.barberiaId, clienteId, { llavero: l.codigoCorto });
  });
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export interface AltaCliente {
  nombre: string;
  telefono: string;
  comoCorta: string;
  notas: string;
  preferencias: string;
  consentimientos: Consentimientos;
}

export async function crearCliente(datos: AltaCliente): Promise<Cliente> {
  const db = store.read();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;
  const codigo = siguienteCodigoCliente(db.clientes.map((c) => c.codigo));

  if (haySupabase) {
    const id = await repo.insertarCliente({
      barberiaId,
      codigo,
      nombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      comoCorta: datos.comoCorta.trim(),
      notas: datos.notas.trim(),
      preferencias: datos.preferencias.trim(),
      consentimientos: datos.consentimientos,
    });
    await refrescar();
    const creado = store.read().clientes.find((c) => c.id === id);
    if (!creado) throw new Error('El cliente se creó pero no se pudo releer.');
    return creado;
  }

  const cliente: Cliente = {
    id: uid('c'),
    barberiaId,
    codigo,
    tokenPublico: tokenLlavero(10),
    nombre: datos.nombre.trim(),
    telefono: datos.telefono.trim(),
    comoCorta: datos.comoCorta.trim(),
    notas: datos.notas.trim(),
    preferencias: datos.preferencias.trim(),
    consentimientos: datos.consentimientos,
    creadoEn: new Date().toISOString(),
  };
  store.mutate((d) => {
    d.clientes.push(cliente);
  });
  return cliente;
}

export async function actualizarCliente(
  id: ID,
  patch: Partial<Omit<Cliente, 'id' | 'barberiaId'>>,
): Promise<void> {
  if (haySupabase) {
    const fila: Record<string, unknown> = {};
    if (patch.nombre !== undefined) fila.nombre = patch.nombre;
    if (patch.telefono !== undefined) fila.telefono = patch.telefono;
    if (patch.comoCorta !== undefined) fila.como_corta = patch.comoCorta;
    if (patch.notas !== undefined) fila.notas = patch.notas;
    if (patch.preferencias !== undefined) fila.preferencias = patch.preferencias;
    if (patch.consentimientos) {
      fila.cons_datos = patch.consentimientos.datos;
      fila.cons_avisos = patch.consentimientos.avisos;
      fila.cons_marketing = patch.consentimientos.marketing;
    }
    if ((await intentar(() => repo.actualizarCliente(id, fila), 'guardar el cliente')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((db) => {
    const c = db.clientes.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
  });
}

/* ------------------------------------------------------------------ */
/* Llaveros                                                            */
/* ------------------------------------------------------------------ */

export async function crearLote(cantidad: number, barberiaId: ID, lote = 'L-002'): Promise<Llavero[]> {
  const nuevos: Llavero[] = Array.from({ length: cantidad }, () => ({
    id: uid('ll'),
    barberiaId,
    token: tokenLlavero(),
    codigoCorto: codigoCorto(),
    lote,
    estado: 'sin_asignar',
    clienteId: null,
    creadoEn: new Date().toISOString(),
    asignadoEn: null,
    retiradoEn: null,
  }));

  if (haySupabase) {
    const ok = await intentar(
      () =>
        repo.insertarLlaveros(
          barberiaId,
          nuevos.map((l) => ({ token: l.token, codigoCorto: l.codigoCorto, lote: l.lote })),
        ),
      'crear los llaveros',
    );
    if (ok === null) return [];
    await refrescar();
    const tokens = new Set(nuevos.map((l) => l.token));
    return store.read().llaveros.filter((l) => tokens.has(l.token));
  }

  store.mutate((d) => {
    d.llaveros.push(...nuevos);
  });
  return nuevos;
}

export async function asignarLlavero(token: string, clienteId: ID): Promise<Llavero | null> {
  const db = store.read();
  const ll = db.llaveros.find((l) => l.token === token);
  if (!ll || ll.estado !== 'sin_asignar') return null;
  if (!db.clientes.some((c) => c.id === clienteId)) return null;

  if (haySupabase) {
    const ok = await intentar(() => repo.vincularLlavero(token, clienteId), 'vincular el llavero');
    if (ok === null) return null;
    await refrescar();
    return store.read().llaveros.find((l) => l.token === token) ?? null;
  }

  const ahora = new Date().toISOString();
  store.mutate((d) => {
    const l = d.llaveros.find((x) => x.id === ll.id);
    if (!l) return;
    l.estado = 'activo';
    l.clienteId = clienteId;
    l.asignadoEn = ahora;
    evento(d, 'llavero_activado', l.barberiaId, clienteId, { token: token.slice(0, 4) + '...' });
  });
  return { ...ll, estado: 'activo', clienteId, asignadoEn: ahora };
}

export async function retirarLlavero(llaveroId: ID): Promise<void> {
  if (haySupabase) {
    if ((await intentar(() => repo.retirarLlavero(llaveroId), 'retirar el llavero')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((db) => {
    const l = db.llaveros.find((x) => x.id === llaveroId);
    if (!l || l.estado === 'retirado') return;
    l.estado = 'retirado';
    l.retiradoEn = new Date().toISOString();
    evento(db, 'llavero_retirado', l.barberiaId, l.clienteId ?? undefined);
  });
}

/* ------------------------------------------------------------------ */
/* Cola                                                                */
/* ------------------------------------------------------------------ */

export async function anadirACola(
  clienteId: ID,
  servicioId: ID | null,
  origen: OrigenCita | 'mostrador' = 'mostrador',
): Promise<string> {
  const db = store.read();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;
  const yaEsta = db.cola.find(
    (q) =>
      q.barberiaId === barberiaId &&
      q.clienteId === clienteId &&
      (q.estado === 'esperando' || q.estado === 'sillon'),
  );
  if (yaEsta) return yaEsta.id;

  if (haySupabase) {
    const id = await intentar(
      () => repo.insertarEnCola({ barberiaId, clienteId, servicioId, origen }),
      'añadir a la cola',
    );
    if (!id) return '';
    await refrescar();
    return id;
  }

  const item = {
    id: uid('q'),
    barberiaId,
    clienteId,
    servicioId,
    estado: 'esperando' as const,
    llegadaEn: new Date().toISOString(),
    inicioEn: null,
    finEn: null,
    origen,
  };
  store.mutate((d) => {
    d.cola.push(item);
    evento(d, 'cliente_añadido_cola', barberiaId, clienteId, { origen });
  });
  return item.id;
}

export async function pasarASillon(colaId: ID, sillaId?: ID): Promise<void> {
  const db = store.get();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;

  // sin silla indicada: la primera libre; si están todas ocupadas, la primera
  const ocupadas = new Set(db.cola.filter((q) => q.estado === 'sillon').map((q) => q.sillaId));
  const libres = sillasDe(db, barberiaId).filter((s) => s.activa && !ocupadas.has(s.id));
  const destino = sillaId ?? libres[0]?.id ?? null;

  if (destino && ocupadas.has(destino)) {
    const otra = libres[0];
    if (!otra) {
      toast('Todas las sillas están ocupadas', 'aviso');
      return;
    }
    return pasarASillon(colaId, otra.id);
  }

  if (haySupabase) {
    if ((await intentar(() => repo.pasarASillon(colaId, destino), 'pasar al sillón')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    const q = d.cola.find((x) => x.id === colaId);
    if (!q) return;
    q.estado = 'sillon';
    q.sillaId = destino;
    q.inicioEn = new Date().toISOString();
    evento(d, 'cliente_sillon', q.barberiaId, q.clienteId);
  });
}

/** Mueve a un cliente que ya está en el sillón a otra silla libre. */
export async function cambiarSilla(colaId: ID, sillaId: ID): Promise<void> {
  const db = store.get();
  const ocupada = db.cola.some((q) => q.estado === 'sillon' && q.sillaId === sillaId && q.id !== colaId);
  if (ocupada) {
    toast('Esa silla está ocupada', 'aviso');
    return;
  }
  if (haySupabase) {
    if ((await intentar(() => repo.cambiarSilla(colaId, sillaId), 'cambiar de silla')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    const q = d.cola.find((x) => x.id === colaId);
    if (q) q.sillaId = sillaId;
  });
}

export async function marcarNoVino(colaId: ID): Promise<void> {
  if (haySupabase) {
    if ((await intentar(() => repo.marcarNoVino(colaId), 'marcar la ausencia')) !== null) await refrescar();
    return;
  }
  store.mutate((db) => {
    const q = db.cola.find((x) => x.id === colaId);
    if (!q) return;
    q.estado = 'no_vino';
    q.finEn = new Date().toISOString();
  });
}

export interface ResultadoAtendido {
  cortesTotales: number;
  recompensaGanada: boolean;
  servicio: string;
  precio: number;
}

/**
 * ATENDIDO: cierra la sesión de cola, registra la visita, incrementa el
 * histórico y comprueba la promoción. Nunca borra historial.
 */
export async function atender(colaId: ID, servicioId: ID | null): Promise<ResultadoAtendido | null> {
  const db = store.read();
  const item = db.cola.find((q) => q.id === colaId);
  if (!item || item.estado !== 'sillon') return null;

  if (haySupabase) {
    const r = await intentar(() => repo.atenderCola(colaId, servicioId), 'cerrar el servicio');
    if (!r) return null;
    await refrescar();
    return r;
  }

  const servicio = db.servicios.find((s) => s.id === (servicioId ?? item.servicioId)) ?? db.servicios[0];
  const barberia = db.barberias.find((b) => b.id === item.barberiaId)!;
  const ahora = new Date().toISOString();
  const visitasPrevias = db.visitas.filter((v) => v.clienteId === item.clienteId).length;
  const cortesTotales = visitasPrevias + 1;
  const recompensaGanada = cortesTotales % barberia.fidelidadMeta === 0;

  store.mutate((d) => {
    const q = d.cola.find((x) => x.id === colaId);
    if (q) {
      q.estado = 'terminado';
      q.finEn = ahora;
      q.servicioId = servicio.id;
    }

    d.visitas.push({
      id: uid('v'),
      barberiaId: item.barberiaId,
      clienteId: item.clienteId,
      servicioId: servicio.id,
      fecha: ahora,
      precio: servicio.precio,
      pagado: true,
      metodo: null,
    });

    d.movimientos.push({
      id: uid('m'),
      barberiaId: item.barberiaId,
      clienteId: item.clienteId,
      tipo: 'corte',
      fecha: ahora,
      nota: servicio.nombre,
    });

    const cita = d.citas.find(
      (c) =>
        c.clienteId === item.clienteId &&
        c.estado !== 'atendida' &&
        c.estado !== 'cancelada' &&
        new Date(c.inicio).toDateString() === new Date().toDateString(),
    );
    if (cita) cita.estado = 'atendida';

    if (recompensaGanada) {
      d.recompensas.push({
        id: uid('rw'),
        barberiaId: item.barberiaId,
        clienteId: item.clienteId,
        estado: 'disponible',
        creadaEn: ahora,
        aplicadaEn: null,
      });
      d.movimientos.push({
        id: uid('m'),
        barberiaId: item.barberiaId,
        clienteId: item.clienteId,
        tipo: 'recompensa_ganada',
        fecha: ahora,
        nota: `Corte gratis nº ${cortesTotales / barberia.fidelidadMeta}`,
      });
      evento(d, 'recompensa_obtenida', item.barberiaId, item.clienteId, { corte: cortesTotales });
    }

    evento(d, 'servicio_terminado', item.barberiaId, item.clienteId, {
      servicio: servicio.nombre,
      precio: servicio.precio,
    });
  });

  return { cortesTotales, recompensaGanada, servicio: servicio.nombre, precio: servicio.precio };
}

export async function aplicarRecompensa(clienteId: ID): Promise<void> {
  if (haySupabase) {
    if ((await intentar(() => repo.aplicarRecompensa(clienteId), 'aplicar la recompensa')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((db) => {
    const rw = db.recompensas.find((r) => r.clienteId === clienteId && r.estado === 'disponible');
    if (!rw) return;
    rw.estado = 'aplicada';
    rw.aplicadaEn = new Date().toISOString();
    db.movimientos.push({
      id: uid('m'),
      barberiaId: rw.barberiaId,
      clienteId,
      tipo: 'recompensa_canjeada',
      fecha: rw.aplicadaEn,
      nota: 'Aplicada en el corte de hoy',
    });
  });
}

/* ------------------------------------------------------------------ */
/* Citas                                                               */
/* ------------------------------------------------------------------ */

export async function crearCita(input: {
  clienteId: ID;
  servicioId: ID;
  inicio: string;
  origen: OrigenCita;
  nota?: string;
}): Promise<Cita> {
  const db = store.read();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;

  const minutos = db.servicios.find((s) => s.id === input.servicioId)?.minutos ?? 30;
  const silla = sillaLibre(db, barberiaId, input.inicio, minutos);

  if (haySupabase) {
    const id = await repo.insertarCita({ barberiaId, ...input, sillaId: silla?.id ?? null });
    await refrescar();
    const creada = store.read().citas.find((c) => c.id === id);
    if (!creada) throw new Error('La cita se creó pero no se pudo releer.');
    return creada;
  }

  const cita: Cita = {
    id: uid('ap'),
    barberiaId,
    clienteId: input.clienteId,
    servicioId: input.servicioId,
    inicio: input.inicio,
    estado: 'confirmada',
    origen: input.origen,
    nota: input.nota ?? '',
    sillaId: silla?.id ?? null,
  };
  store.mutate((d) => {
    d.citas.push(cita);
    evento(d, 'cita_solicitada', barberiaId, input.clienteId, { origen: input.origen });
  });
  return cita;
}

export async function cambiarEstadoCita(citaId: ID, estado: EstadoCita): Promise<void> {
  if (haySupabase) {
    if ((await intentar(() => repo.cambiarEstadoCita(citaId, estado), 'cambiar la cita')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((db) => {
    const c = db.citas.find((x) => x.id === citaId);
    if (!c) return;
    c.estado = estado;
    if (estado === 'confirmada') evento(db, 'cita_confirmada', c.barberiaId, c.clienteId);
  });
}

/* ------------------------------------------------------------------ */
/* Mensajes (simulados, registrados)                                   */
/* ------------------------------------------------------------------ */

export async function registrarMensaje(input: {
  clienteId: ID;
  tipo: TipoMensaje;
  canal: 'whatsapp' | 'sms';
  texto: string;
}): Promise<void> {
  const db = store.read();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;

  if (haySupabase) {
    if (
      (await intentar(() => repo.insertarMensaje({ barberiaId, ...input }), 'registrar el mensaje')) !== null
    ) {
      await refrescar();
    }
    return;
  }

  store.mutate((d) => {
    d.mensajes.push({
      id: uid('msg'),
      barberiaId,
      clienteId: input.clienteId,
      tipo: input.tipo,
      canal: input.canal,
      estado: 'simulado',
      fecha: new Date().toISOString(),
      texto: input.texto,
    });
    evento(d, 'mensaje_simulado', barberiaId, input.clienteId, { tipo: input.tipo, canal: input.canal });
  });
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export async function actualizarBarberia(patch: Partial<Db['barberias'][number]>): Promise<void> {
  const db = store.read();
  const barberiaId = db.sesion?.barberiaId ?? db.barberias[0].id;

  if (haySupabase) {
    const fila: Record<string, unknown> = { id: barberiaId };
    if (patch.nombre !== undefined) fila.nombre = patch.nombre;
    if (patch.color !== undefined) fila.color = patch.color;
    if (patch.telefono !== undefined) fila.telefono = patch.telefono;
    if (patch.direccion !== undefined) fila.direccion = patch.direccion;
    if (patch.fidelidadMeta !== undefined) fila.fidelidad_meta = patch.fidelidadMeta;
    if (patch.tipo !== undefined) fila.tipo = patch.tipo;
    if (patch.logo !== undefined) fila.logo_url = patch.logo;
    if ((await intentar(() => repo.actualizarLocal(fila), 'guardar el local')) !== null) await refrescar();
    return;
  }

  store.mutate((d) => {
    const b = d.barberias.find((x) => x.id === barberiaId);
    if (!b) return;
    Object.assign(b, patch);
  });
}

/* ------------------------------- Sillas ------------------------------- */

export async function crearSilla(nombre: string): Promise<void> {
  const db = store.get();
  const barberia = db.barberias[0];
  if (!barberia) return;
  const limpio = nombre.trim() || `Silla ${(db.sillas?.length ?? 0) + 1}`;
  const orden = (db.sillas ?? []).reduce((m, s) => Math.max(m, s.orden), 0) + 1;

  if (haySupabase) {
    if ((await intentar(() => repo.insertarSilla({ barberiaId: barberia.id, nombre: limpio, orden }), 'crear la silla')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    d.sillas = [...(d.sillas ?? []), {
      id: uid('silla'),
      barberiaId: barberia.id,
      nombre: limpio,
      orden,
      activa: true,
    }];
  });
}

export async function actualizarSilla(
  id: ID,
  patch: { nombre?: string; activa?: boolean },
): Promise<void> {
  if (haySupabase) {
    if ((await intentar(() => repo.actualizarSilla(id, patch), 'guardar la silla')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    const s = (d.sillas ?? []).find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
  });
}

export async function quitarSilla(id: ID): Promise<void> {
  const db = store.get();
  const activas = (db.sillas ?? []).filter((s) => s.activa);
  if (activas.length <= 1 && activas.some((s) => s.id === id)) {
    toast('Deja al menos una silla activa', 'aviso');
    return;
  }
  if (haySupabase) {
    if ((await intentar(() => repo.eliminarSilla(id), 'quitar la silla')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    d.sillas = (d.sillas ?? []).filter((s) => s.id !== id);
  });
}

export async function crearServicio(nombre = 'Servicio nuevo'): Promise<void> {
  const db = store.get();
  const barberia = db.barberias[0];
  if (!barberia) return;
  const orden = db.servicios.reduce((m, s) => Math.max(m, s.orden ?? 0), 0) + 1;

  if (haySupabase) {
    const fila = {
      barberiaId: barberia.id,
      nombre: nombre.trim() || 'Servicio nuevo',
      precio: 15,
      minutos: 30,
      orden,
    };
    if ((await intentar(() => repo.insertarServicio(fila), 'crear el servicio')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((d) => {
    d.servicios.push({
      id: uid('sv'),
      barberiaId: barberia.id,
      nombre: nombre.trim() || 'Servicio nuevo',
      precio: 15,
      minutos: 30,
      activo: true,
      orden,
    });
  });
}

export async function actualizarServicio(
  id: ID,
  patch: Partial<Db['servicios'][number]>,
): Promise<void> {
  if (haySupabase) {
    const fila: Record<string, unknown> = {};
    if (patch.nombre !== undefined) fila.nombre = patch.nombre;
    if (patch.precio !== undefined) fila.precio = patch.precio;
    if (patch.minutos !== undefined) fila.minutos = patch.minutos;
    if (patch.activo !== undefined) fila.activo = patch.activo;
    if ((await intentar(() => repo.actualizarServicio(id, fila), 'guardar el servicio')) !== null) {
      await refrescar();
    }
    return;
  }
  store.mutate((db) => {
    const s = db.servicios.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
  });
}

export function reiniciarDemo(): void {
  if (haySupabase) return;
  store.reset();
}

/** Datos de hoy, para que la demo no caduque. */
export function hoyRango(): { desde: number; hasta: number } {
  const d = startOfDay(new Date());
  return { desde: d.getTime(), hasta: addDays(d, 1).getTime() };
}
