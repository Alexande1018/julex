/**
 * Cara pública del cliente: la tarjeta y la reserva funcionan sin sesión.
 *
 * Dos fuentes con la misma forma:
 *  - modo local: se calcula del almacén del navegador;
 *  - modo real: `ficha_publica()` en Postgres, que solo devuelve lo del token.
 */
import { supabase, haySupabase } from './supabase';
import { store } from './store';
import { actualizarCliente, cambiarEstadoCita } from './actions';
import { servicioDe } from './derive';
import type { Consentimientos, EstadoCita } from './types';

export interface FichaPublica {
  estado: 'abierta';
  local: {
    nombre: string;
    slug: string;
    color: string;
    direccion: string;
    telefono: string;
    logo: string | null;
    fidelidadMeta: number;
  };
  cliente: {
    nombre: string;
    codigo: string;
    telefono: string;
    preferencias: string;
    creadoEn: string;
    consentimientos: Consentimientos;
  };
  cortes: number;
  gastado: number;
  ciclo: number;
  recompensas: { disponibles: number; aplicadas: number };
  proxima: {
    id: string;
    inicio: string;
    estado: EstadoCita;
    servicio: string;
    precio: number;
  } | null;
  visitas: { fecha: string; precio: number; servicio: string }[];
  servicios: ServicioPublico[];
  /** Si está en la cola: en qué silla y desde cuándo. */
  cola: { estado: 'esperando' | 'sillon'; silla: string | null; desde: string | null } | null;
}

export interface ServicioPublico {
  id: string;
  nombre: string;
  precio: number;
  minutos: number;
}

/** La tarjeta está protegida con un PIN y no se ha abierto. */
export interface FichaCerrada {
  estado: 'denegada' | 'bloqueada';
}

export type ResultadoFicha = FichaPublica | FichaCerrada;

/**
 * El PIN viaja en cada llamada y se recuerda solo en esta pestaña
 * (`sessionStorage`): al cerrar el navegador se vuelve a pedir, y el
 * navegador del barbero no lo guarda por haber abierto una tarjeta.
 */
const CLAVE_PIN = 'julex.pin.';

export function pinDeSesion(token: string): string | null {
  try {
    return sessionStorage.getItem(CLAVE_PIN + token);
  } catch {
    return null;
  }
}

export function recordarPin(token: string, pin: string | null): void {
  try {
    if (pin) sessionStorage.setItem(CLAVE_PIN + token, pin);
    else sessionStorage.removeItem(CLAVE_PIN + token);
  } catch {
    // Sin almacenamiento: se pedirá otra vez al recargar. No es un fallo.
  }
}

export interface LocalPublico {
  id: string;
  nombre: string;
  slug: string;
  color: string;
  direccion: string;
  telefono: string;
  logo: string | null;
  fidelidadMeta: number;
  servicios: ServicioPublico[];
}

/* ------------------------------------------------------------------ */
/* Fuente local                                                        */
/* ------------------------------------------------------------------ */

export function fichaLocal(token: string, pin: string | null = null): ResultadoFicha | null {
  const db = store.read();
  const c = db.clientes.find((x) => x.tokenPublico === token);
  if (!c) return null;

  // En la demo el PIN se guarda en el propio navegador: sirve para probar el
  // flujo, no para proteger nada. El bloqueo por intentos solo existe en el
  // servidor, que es donde se puede contar de verdad.
  if (c.pin && c.pin !== pin) return { estado: 'denegada' };

  const b = db.barberias.find((x) => x.id === c.barberiaId);
  if (!b) return null;

  const meta = Math.max(1, b.fidelidadMeta);
  const visitas = db.visitas
    .filter((v) => v.clienteId === c.id)
    .sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());

  const disponibles = db.recompensas.filter(
    (r) => r.clienteId === c.id && r.estado === 'disponible',
  ).length;
  const aplicadas = db.recompensas.filter((r) => r.clienteId === c.id && r.estado === 'aplicada').length;
  const restante = visitas.length % meta;

  const proxima = db.citas
    .filter(
      (x) =>
        x.clienteId === c.id &&
        (x.estado === 'pendiente' || x.estado === 'confirmada') &&
        new Date(x.inicio).getTime() >= Date.now() - 60_000,
    )
    .sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime())[0];

  const servicioProxima = proxima ? servicioDe(db, proxima.servicioId) : undefined;

  return {
    estado: 'abierta',
    local: {
      nombre: b.nombre,
      slug: b.slug,
      color: b.color,
      direccion: b.direccion,
      telefono: b.telefono,
      logo: b.logo,
      fidelidadMeta: meta,
    },
    cliente: {
      nombre: c.nombre,
      codigo: c.codigo,
      telefono: c.telefono,
      preferencias: c.preferencias,
      creadoEn: c.creadoEn,
      consentimientos: c.consentimientos,
    },
    cortes: visitas.length,
    gastado: visitas.reduce((s, v) => s + v.precio, 0),
    ciclo: disponibles > 0 ? meta : restante,
    recompensas: { disponibles, aplicadas },
    proxima: proxima
      ? {
          id: proxima.id,
          inicio: proxima.inicio,
          estado: proxima.estado,
          servicio: servicioProxima?.nombre ?? 'Servicio',
          precio: servicioProxima?.precio ?? 0,
        }
      : null,
    visitas: visitas.slice(0, 10).map((v) => ({
      fecha: v.fecha,
      precio: v.precio,
      servicio: servicioDe(db, v.servicioId)?.nombre ?? 'Corte',
    })),
    servicios: db.servicios
      .filter((x) => x.barberiaId === b.id && x.activo)
      .map((x) => ({ id: x.id, nombre: x.nombre, precio: x.precio, minutos: x.minutos })),
    cola: (() => {
      const enCola = db.cola.find(
        (q) => q.clienteId === c.id && (q.estado === 'esperando' || q.estado === 'sillon'),
      );
      if (!enCola) return null;
      return {
        estado: enCola.estado as 'esperando' | 'sillon',
        silla: db.sillas?.find((x) => x.id === enCola.sillaId)?.nombre ?? null,
        desde: enCola.inicioEn,
      };
    })(),
  };
}

/* ------------------------------------------------------------------ */
/* Fuente real                                                         */
/* ------------------------------------------------------------------ */

export async function cargarFicha(
  token: string,
  pin: string | null = null,
): Promise<ResultadoFicha | null> {
  if (!haySupabase) return fichaLocal(token, pin);
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('ficha_publica', { p_token: token, p_pin: pin });
  if (error) throw new Error(error.message);
  if (!data) return null;

  const r = data as Record<string, any>;

  // Con PIN puesto y sin acertarlo, el servidor devuelve solo el estado.
  if (r.estado === 'denegada' || r.estado === 'bloqueada') {
    return { estado: r.estado as 'denegada' | 'bloqueada' };
  }
  const meta = Number(r.local?.fidelidad_meta ?? 10);
  const cortes = Number(r.cortes ?? 0);
  const disponibles = Number(r.recompensas?.disponibles ?? 0);

  return {
    estado: 'abierta',
    local: {
      nombre: String(r.local?.nombre ?? ''),
      slug: String(r.local?.slug ?? ''),
      color: String(r.local?.color ?? '#3E4A35'),
      direccion: String(r.local?.direccion ?? ''),
      telefono: String(r.local?.telefono ?? ''),
      logo: r.local?.logo_url ? String(r.local.logo_url) : null,
      fidelidadMeta: meta,
    },
    cliente: {
      nombre: String(r.cliente?.nombre ?? ''),
      codigo: String(r.cliente?.codigo ?? ''),
      telefono: String(r.cliente?.telefono ?? ''),
      preferencias: String(r.cliente?.preferencias ?? ''),
      creadoEn: String(r.cliente?.creado_en ?? ''),
      consentimientos: {
        datos: r.consentimientos?.datos !== false,
        avisos: r.consentimientos?.avisos === true,
        marketing: r.consentimientos?.marketing === true,
      },
    },
    cortes,
    gastado: Number(r.gastado ?? 0),
    ciclo: disponibles > 0 ? meta : cortes % meta,
    recompensas: { disponibles, aplicadas: Number(r.recompensas?.aplicadas ?? 0) },
    proxima: r.proxima
      ? {
          id: String(r.proxima.id),
          inicio: String(r.proxima.inicio),
          estado: String(r.proxima.estado) as EstadoCita,
          servicio: String(r.proxima.servicio ?? 'Servicio'),
          precio: Number(r.proxima.precio ?? 0),
        }
      : null,
    visitas: (r.visitas ?? []).map((v: Record<string, any>) => ({
      fecha: String(v.fecha),
      precio: Number(v.precio ?? 0),
      servicio: String(v.servicio ?? 'Corte'),
    })),
    servicios: (r.servicios ?? []).map((x: Record<string, any>) => ({
      id: String(x.id),
      nombre: String(x.nombre),
      precio: Number(x.precio ?? 0),
      minutos: Number(x.minutos ?? 30),
    })),
    cola: r.cola
      ? {
          estado: String(r.cola.estado) as 'esperando' | 'sillon',
          silla: r.cola.silla ? String(r.cola.silla) : null,
          desde: r.cola.desde ? String(r.cola.desde) : null,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Acciones del cliente                                                */
/* ------------------------------------------------------------------ */

export async function cancelarCitaPublica(
  token: string,
  citaId: string,
  pin: string | null = null,
): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('cancelar_cita', {
      p_token: token,
      p_cita: citaId,
      p_pin: pin,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
  const f = fichaLocal(token, pin);
  if (!f || f.estado !== 'abierta' || !f.proxima || f.proxima.id !== citaId) return false;
  await cambiarEstadoCita(citaId, 'cancelada');
  return true;
}

export async function guardarMisDatos(
  token: string,
  datos: { telefono: string; preferencias: string; avisos: boolean; marketing: boolean },
  pin: string | null = null,
): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('actualizar_mis_datos', {
      p_token: token,
      p_telefono: datos.telefono,
      p_preferencias: datos.preferencias,
      p_avisos: datos.avisos,
      p_marketing: datos.marketing,
      p_pin: pin,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  const db = store.read();
  const c = db.clientes.find((x) => x.tokenPublico === token);
  if (!c) return false;
  if (c.pin && c.pin !== pin) return false;
  await actualizarCliente(c.id, {
    telefono: datos.telefono.trim(),
    preferencias: datos.preferencias.trim(),
    consentimientos: { ...c.consentimientos, avisos: datos.avisos, marketing: datos.marketing },
  });
  return true;
}

export async function pedirBaja(token: string, pin: string | null = null): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('solicitar_baja', { p_token: token, p_pin: pin });
    if (error) throw new Error(error.message);
    return data === true;
  }

  const db = store.read();
  const c = db.clientes.find((x) => x.tokenPublico === token);
  if (!c) return false;
  if (c.pin && c.pin !== pin) return false;
  await actualizarCliente(c.id, {
    consentimientos: { ...c.consentimientos, avisos: false, marketing: false },
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* El PIN de la tarjeta                                                */
/* ------------------------------------------------------------------ */

/**
 * Pone o cambia el PIN. La primera vez basta con tener el enlace; a partir
 * de ahí hace falta el actual, o cualquiera que lea el QR podría cambiarlo.
 */
export async function ponerPin(
  token: string,
  nuevo: string,
  actual: string | null = null,
): Promise<boolean> {
  if (!/^[0-9]{4,6}$/.test(nuevo)) throw new Error('El PIN tiene que ser de 4 a 6 cifras.');
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('pin_poner', {
      p_token: token,
      p_pin_nuevo: nuevo,
      p_pin_actual: actual,
    });
    if (error) {
      if (error.message.includes('pin_invalido')) {
        throw new Error('El PIN tiene que ser de 4 a 6 cifras.');
      }
      throw new Error(error.message);
    }
    return data === true;
  }
  const db = store.read();
  const c = db.clientes.find((x) => x.tokenPublico === token);
  if (!c) return false;
  if (c.pin && c.pin !== actual) return false;
  await actualizarCliente(c.id, { pin: nuevo });
  return true;
}

export async function quitarPin(token: string, actual: string | null = null): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('pin_quitar', { p_token: token, p_pin: actual });
    if (error) throw new Error(error.message);
    return data === true;
  }
  const db = store.read();
  const c = db.clientes.find((x) => x.tokenPublico === token);
  if (!c) return false;
  if (c.pin && c.pin !== actual) return false;
  await actualizarCliente(c.id, { pin: undefined });
  return true;
}

/* El barbero, desde la ficha: no puede leer el PIN, solo quitarlo. */

export async function estadoPin(clienteId: string): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('pin_barbero_estado', { p_cliente: clienteId });
    if (error) return false;
    return data === true;
  }
  const db = store.read();
  return Boolean(db.clientes.find((c) => c.id === clienteId)?.pin);
}

export async function quitarPinComoBarbero(clienteId: string): Promise<boolean> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('pin_barbero_quitar', { p_cliente: clienteId });
    if (error) throw new Error(error.message);
    return data === true;
  }
  const db = store.read();
  const c = db.clientes.find((x) => x.id === clienteId);
  if (!c) return false;
  await actualizarCliente(c.id, { pin: undefined });
  return true;
}

/* ------------------------------------------------------------------ */
/* Reserva: local, huecos y solicitud                                  */
/* ------------------------------------------------------------------ */

function localDesdeFicha(f: FichaPublica): LocalPublico {
  return { ...f.local, id: '', servicios: f.servicios };
}

export async function cargarLocal(slug: string): Promise<LocalPublico | null> {
  if (!haySupabase) {
    const db = store.read();
    const b = db.barberias.find((x) => x.slug === slug);
    if (!b) return null;
    return {
      id: b.id,
      nombre: b.nombre,
      slug: b.slug,
      color: b.color,
      direccion: b.direccion,
      telefono: b.telefono,
      logo: b.logo,
      fidelidadMeta: b.fidelidadMeta,
      servicios: db.servicios
        .filter((s) => s.barberiaId === b.id && s.activo)
        .map((s) => ({ id: s.id, nombre: s.nombre, precio: s.precio, minutos: s.minutos })),
    };
  }

  const { data, error } = await supabase!.rpc('local_publico', { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, any>;

  return {
    id: String(r.id ?? ''),
    nombre: String(r.nombre ?? ''),
    slug: String(r.slug ?? ''),
    color: String(r.color ?? '#3E4A35'),
    direccion: String(r.direccion ?? ''),
    telefono: String(r.telefono ?? ''),
    logo: r.logo_url ? String(r.logo_url) : null,
    fidelidadMeta: Number(r.fidelidad_meta ?? 10),
    servicios: (r.servicios ?? []).map((x: Record<string, any>) => ({
      id: String(x.id),
      nombre: String(x.nombre),
      precio: Number(x.precio ?? 0),
      minutos: Number(x.minutos ?? 30),
    })),
  };
}

/** Quien reserva: cliente con token, o local público por slug. */
export type DestinoReserva =
  | { tipo: 'ok'; local: LocalPublico; cliente: string | null; token: string | null }
  /** La tarjeta viene protegida: antes de reservar hay que abrirla. */
  | { tipo: 'protegida'; estado: 'denegada' | 'bloqueada' };

export async function cargarDestinoReserva(
  token: string | undefined,
  slug: string | undefined,
  pin: string | null = null,
): Promise<DestinoReserva | null> {
  if (token) {
    const f = await cargarFicha(token, pin);
    if (!f) return null;
    if (f.estado !== 'abierta') return { tipo: 'protegida', estado: f.estado };
    return { tipo: 'ok', local: localDesdeFicha(f), cliente: f.cliente.nombre, token };
  }
  if (!slug) return null;
  const local = await cargarLocal(slug);
  if (!local) return null;
  return { tipo: 'ok', local, cliente: null, token: null };
}

const APERTURA = 10 * 60;
const CIERRE = 20 * 60;

function huecosLocales(dia: Date, minutos: number): string[] {
  const db = store.read();
  const salida: string[] = [];

  for (let m = APERTURA; m + minutos <= CIERRE; m += 30) {
    const ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, m, 0, 0);
    const fin = new Date(ini.getTime() + minutos * 60_000);
    if (ini.getTime() < Date.now() + 30 * 60_000) continue;

    const ocupado = db.citas
      .filter((c) => c.estado !== 'cancelada' && c.estado !== 'no_vino')
      .some((c) => {
        const cIni = new Date(c.inicio).getTime();
        const serv = db.servicios.find((s) => s.id === c.servicioId);
        const cFin = cIni + (serv?.minutos ?? 30) * 60_000;
        return cIni < fin.getTime() && cFin > ini.getTime();
      });

    if (!ocupado) {
      salida.push(
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
      );
    }
  }
  return salida;
}

export async function huecosPublicos(
  slug: string,
  dia: Date,
  minutos: number,
): Promise<string[]> {
  if (!haySupabase) return huecosLocales(dia, minutos);

  const fecha = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(
    dia.getDate(),
  ).padStart(2, '0')}`;

  const { data, error } = await supabase!.rpc('huecos_publicos', {
    p_slug: slug,
    p_dia: fecha,
    p_minutos: minutos,
    p_paso: 30,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as string[]) : [];
}

export async function pedirCita(input: {
  slug: string;
  servicioId: string;
  inicio: Date;
  nombre: string;
  telefono: string;
  token?: string | null;
  origen: 'qr' | 'web';
  pin?: string | null;
}): Promise<string> {
  if (haySupabase) {
    const { data, error } = await supabase!.rpc('solicitar_cita', {
      p_slug: input.slug,
      p_servicio: input.servicioId,
      p_inicio: input.inicio.toISOString(),
      p_nombre: input.nombre,
      p_telefono: input.telefono,
      p_token: input.token ?? null,
      p_origen: input.origen,
      p_pin: input.pin ?? null,
    });
    if (error) {
      if (error.message.includes('horario_ocupado')) {
        throw new Error('Ese hueco se acaba de ocupar. Elige otro, por favor.');
      }
      if (error.message.includes('tarjeta_protegida')) {
        throw new Error('Esa tarjeta pide un PIN. Ábrela desde su enlace y reserva desde ahí.');
      }
      throw new Error(error.message);
    }
    return String(data);
  }

  // Modo local: misma comprobación de solape antes de crear nada.
  const db = store.read();
  const barberia = db.barberias.find((b) => b.slug === input.slug);
  if (!barberia) throw new Error('Ese local no existe.');
  const servicio = db.servicios.find((s) => s.id === input.servicioId);
  if (!servicio) throw new Error('Ese servicio no existe.');

  const fin = input.inicio.getTime() + servicio.minutos * 60_000;
  const ocupado = db.citas
    .filter((c) => c.barberiaId === barberia.id)
    .filter((c) => c.estado !== 'cancelada' && c.estado !== 'no_vino')
    .some((c) => {
      const cIni = new Date(c.inicio).getTime();
      const serv = db.servicios.find((s) => s.id === c.servicioId);
      const cFin = cIni + (serv?.minutos ?? 30) * 60_000;
      return cIni < fin && cFin > input.inicio.getTime();
    });
  if (ocupado) throw new Error('Ese hueco se acaba de ocupar. Elige otro, por favor.');

  const { crearCliente, crearCita } = await import('./actions');

  let clienteId: string | undefined;
  if (input.token) {
    const c = db.clientes.find((x) => x.tokenPublico === input.token);
    clienteId = c?.id;
  }
  if (!clienteId) {
    const nuevo = await crearCliente({
      nombre: input.nombre,
      telefono: input.telefono,
      comoCorta: '',
      notas: '',
      preferencias: '',
      consentimientos: { datos: true, avisos: true, marketing: false },
    });
    clienteId = nuevo.id;
  }

  const cita = await crearCita({
    clienteId,
    servicioId: input.servicioId,
    inicio: input.inicio.toISOString(),
    origen: input.origen,
  });
  return cita.id;
}
