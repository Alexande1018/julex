import { exigirCliente } from './supabase';
import {
  aBarberia,
  aBarbero,
  aSilla,
  aCita,
  aCliente,
  aCola,
  aEvento,
  aLlavero,
  aMensaje,
  aMovimiento,
  aRecompensa,
  aServicio,
  aVisita,
} from './mapa';
import type { Cita, Db, EstadoCita, ID, OrigenCita, TipoMensaje } from './types';

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

/**
 * Trae el local completo del usuario autenticado. RLS ya impide ver otra
 * cosa; los filtros explícitos son para que los índices hagan su trabajo.
 */
export async function cargarTodo(): Promise<Db | null> {
  const sb = exigirCliente();

  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;

  const { data: barberia, error } = await sb.from('barberias').select('*').maybeSingle();
  if (error) throw new Error(`barberias: ${error.message}`);
  if (!barberia) return null;

  const barberiaId = barberia.id as string;
  const porLocal = (tabla: string) => sb.from(tabla).select('*').eq('barberia_id', barberiaId);

  const [barberos, sillas, servicios, clientes, llaveros, citas, cola, visitas, movimientos, recompensas, mensajes, eventos] =
    await Promise.all([
      porLocal('barberos').order('creado_en'),
      porLocal('sillas').order('orden'),
      porLocal('servicios').order('orden'),
      porLocal('clientes').order('creado_en'),
      porLocal('llaveros').order('creado_en'),
      porLocal('citas').order('inicio'),
      porLocal('cola').order('llegada_en'),
      porLocal('visitas').order('fecha', { ascending: false }).limit(3000),
      porLocal('movimientos_fidelizacion').order('fecha', { ascending: false }).limit(3000),
      porLocal('recompensas'),
      porLocal('mensajes_log').order('fecha', { ascending: false }).limit(300),
      porLocal('eventos').order('fecha', { ascending: false }).limit(300),
    ]);

  const fallo = [barberos, sillas, servicios, clientes, llaveros, citas, cola, visitas, movimientos, recompensas, mensajes, eventos].find(
    (r) => r.error,
  );
  if (fallo?.error) throw new Error(`cargando el local: ${fallo.error.message}`);

  return {
    version: 0,
    barberias: [aBarberia(barberia)],
    barberos: (barberos.data ?? []).map(aBarbero),
    sillas: (sillas.data ?? []).map(aSilla),
    servicios: (servicios.data ?? []).map(aServicio),
    clientes: (clientes.data ?? []).map(aCliente),
    llaveros: (llaveros.data ?? []).map(aLlavero),
    citas: (citas.data ?? []).map(aCita),
    cola: (cola.data ?? []).map(aCola),
    visitas: (visitas.data ?? []).map(aVisita),
    movimientos: (movimientos.data ?? []).map(aMovimiento),
    recompensas: (recompensas.data ?? []).map(aRecompensa),
    mensajes: (mensajes.data ?? []).map(aMensaje),
    eventos: (eventos.data ?? []).map(aEvento),
    sesion: { barberoId: auth.user.id, barberiaId },
  };
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`);
}

export async function actualizarLocal(patch: Partial<Record<string, unknown>>): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('barberias').update(patch).eq('id', patch.id as string);
  if (error) fallo('actualizando el local', error);
}

export async function insertarSilla(input: {
  barberiaId: string;
  nombre: string;
  orden: number;
}): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('sillas').insert({
    barberia_id: input.barberiaId,
    nombre: input.nombre,
    orden: input.orden,
  });
  if (error) fallo('creando la silla', error);
}

export async function actualizarSilla(
  id: string,
  patch: { nombre?: string; activa?: boolean; orden?: number },
): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('sillas').update(patch).eq('id', id);
  if (error) fallo('guardando la silla', error);
}

export async function eliminarSilla(id: string): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('sillas').delete().eq('id', id);
  if (error) fallo('quitando la silla', error);
}

export async function actualizarServicio(
  id: ID,
  patch: { nombre?: string; precio?: number; minutos?: number; activo?: boolean },
): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('servicios').update(patch).eq('id', id);
  if (error) fallo('actualizando el servicio', error);
}

export async function insertarCliente(datos: {
  barberiaId: ID;
  codigo: string;
  nombre: string;
  telefono: string;
  comoCorta: string;
  notas: string;
  preferencias: string;
  consentimientos: { datos: boolean; avisos: boolean; marketing: boolean };
}): Promise<ID> {
  const sb = exigirCliente();
  const { data, error } = await sb
    .from('clientes')
    .insert({
      barberia_id: datos.barberiaId,
      codigo: datos.codigo,
      nombre: datos.nombre,
      telefono: datos.telefono,
      como_corta: datos.comoCorta,
      notas: datos.notas,
      preferencias: datos.preferencias,
      cons_datos: datos.consentimientos.datos,
      cons_avisos: datos.consentimientos.avisos,
      cons_marketing: datos.consentimientos.marketing,
    })
    .select('id')
    .single();
  if (error) fallo('creando el cliente', error);
  return data!.id as string;
}

export async function actualizarCliente(
  id: ID,
  patch: {
    nombre?: string;
    telefono?: string;
    como_corta?: string;
    notas?: string;
    preferencias?: string;
    cons_datos?: boolean;
    cons_avisos?: boolean;
    cons_marketing?: boolean;
  },
): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('clientes').update(patch).eq('id', id);
  if (error) fallo('actualizando el cliente', error);
}

export async function insertarLlaveros(
  barberiaId: ID,
  llaveros: { token: string; codigoCorto: string; lote: string }[],
): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('llaveros').insert(
    llaveros.map((l) => ({
      barberia_id: barberiaId,
      token: l.token,
      codigo_corto: l.codigoCorto,
      lote: l.lote,
    })),
  );
  if (error) fallo('creando los llaveros', error);
}

/** Vincular un llavero en blanco. La coherencia la impone un constraint. */
export async function vincularLlavero(token: string, clienteId: ID): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb
    .from('llaveros')
    .update({ estado: 'activo', cliente_id: clienteId, asignado_en: new Date().toISOString() })
    .eq('token', token)
    .eq('estado', 'sin_asignar');
  if (error) fallo('vinculando el llavero', error);
}

/** Retirar es definitivo: el token no vuelve nunca. */
export async function retirarLlavero(id: ID): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb
    .from('llaveros')
    .update({ estado: 'retirado', retirado_en: new Date().toISOString() })
    .eq('id', id)
    .neq('estado', 'retirado');
  if (error) fallo('retirando el llavero', error);
}

export async function insertarEnCola(datos: {
  barberiaId: ID;
  clienteId: ID;
  servicioId: ID | null;
  origen: OrigenCita | 'mostrador';
}): Promise<ID> {
  const sb = exigirCliente();
  const { data, error } = await sb
    .from('cola')
    .insert({
      barberia_id: datos.barberiaId,
      cliente_id: datos.clienteId,
      servicio_id: datos.servicioId,
      origen: datos.origen,
    })
    .select('id')
    .single();
  if (error) fallo('añadiendo a la cola', error);
  return data!.id as string;
}

export async function pasarASillon(id: ID): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb
    .from('cola')
    .update({ estado: 'sillon', inicio_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'esperando');
  if (error) fallo('pasando al sillón', error);
}

export async function marcarNoVino(id: ID): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb
    .from('cola')
    .update({ estado: 'no_vino', fin_en: new Date().toISOString() })
    .eq('id', id);
  if (error) fallo('marcando la ausencia', error);
}

export interface ResultadoAtendido {
  cortesTotales: number;
  recompensaGanada: boolean;
  servicio: string;
  precio: number;
}

/** Todo el cierre de una visita ocurre dentro de una transacción en Postgres. */
export async function atenderCola(colaId: ID, servicioId: ID | null): Promise<ResultadoAtendido> {
  const sb = exigirCliente();
  const { data, error } = await sb.rpc('atender_cola', {
    p_cola_id: colaId,
    p_servicio_id: servicioId,
  });
  if (error) fallo('cerrando el servicio', error);
  const r = data as Record<string, any>;
  return {
    cortesTotales: Number(r.cortesTotales ?? 0),
    recompensaGanada: r.recompensaGanada === true,
    servicio: String(r.servicio ?? ''),
    precio: Number(r.precio ?? 0),
  };
}

export async function aplicarRecompensa(clienteId: ID): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.rpc('aplicar_recompensa', { p_cliente_id: clienteId });
  if (error) fallo('aplicando la recompensa', error);
}

export async function insertarCita(datos: {
  barberiaId: ID;
  clienteId: ID;
  servicioId: ID;
  inicio: string;
  origen: OrigenCita;
  nota?: string;
  sillaId?: string | null;
}): Promise<ID> {
  const sb = exigirCliente();
  const { data, error } = await sb
    .from('citas')
    .insert({
      barberia_id: datos.barberiaId,
      cliente_id: datos.clienteId,
      servicio_id: datos.servicioId,
      inicio: datos.inicio,
      origen: datos.origen,
      nota: datos.nota ?? '',
      estado: 'pendiente',
      silla_id: datos.sillaId ?? null,
    })
    .select('id')
    .single();
  if (error) fallo('creando la cita', error);
  return data!.id as string;
}

export async function cambiarEstadoCita(id: ID, estado: EstadoCita): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('citas').update({ estado }).eq('id', id);
  if (error) fallo('cambiando la cita', error);
}

export async function insertarMensaje(datos: {
  barberiaId: ID;
  clienteId: ID;
  tipo: TipoMensaje;
  canal: 'whatsapp' | 'sms';
  texto: string;
}): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('mensajes_log').insert({
    barberia_id: datos.barberiaId,
    cliente_id: datos.clienteId,
    tipo: datos.tipo,
    canal: datos.canal,
    texto: datos.texto,
    estado: 'simulado',
  });
  if (error) fallo('registrando el mensaje', error);
}

export async function insertarEvento(datos: {
  barberiaId: ID;
  clienteId?: ID;
  tipo: string;
  meta?: Record<string, string | number | boolean>;
}): Promise<void> {
  const sb = exigirCliente();
  const { error } = await sb.from('eventos').insert({
    barberia_id: datos.barberiaId,
    cliente_id: datos.clienteId ?? null,
    tipo: datos.tipo,
    meta: datos.meta ?? {},
  });
  if (error) fallo('registrando el evento', error);
}

/** Citas del día que aún no se han cerrado, para marcar la atendida. */
export async function citasAbiertasDe(clienteId: ID): Promise<Cita[]> {
  const sb = exigirCliente();
  const { data, error } = await sb
    .from('citas')
    .select('*')
    .eq('cliente_id', clienteId)
    .in('estado', ['pendiente', 'confirmada']);
  if (error) fallo('leyendo las citas', error);
  return (data ?? []).map(aCita);
}

/**
 * Sube el logo del local a Storage y devuelve su URL pública.
 * Nombre fijo + marca de tiempo en la URL para que el móvil no enseñe el viejo.
 */
export async function subirLogo(barberiaId: string, blob: Blob): Promise<string> {
  const sb = exigirCliente();
  const ruta = `${barberiaId}/logo.webp`;

  const { error } = await sb.storage
    .from('logos')
    .upload(ruta, blob, { contentType: 'image/webp', upsert: true });
  if (error) fallo('subiendo el logo', error);

  const { data } = sb.storage.from('logos').getPublicUrl(ruta);
  return `${data.publicUrl}?v=${Date.now()}`;
}
