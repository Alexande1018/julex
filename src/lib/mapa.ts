/**
 * Traducción entre las filas de Postgres y el modelo que usan las pantallas.
 * Todo lo que entra o sale de la base pasa por aquí.
 */
import type {
  Barberia,
  Barbero,
  Silla,
  Cita,
  Cliente,
  ColaItem,
  Db,
  Evento,
  Llavero,
  Mensaje,
  Movimiento,
  Recompensa,
  Servicio,
  Visita,
} from './types';

type Fila = Record<string, any>;

const n = (v: unknown, def = 0): number => (v === null || v === undefined ? def : Number(v));
const s = (v: unknown, def = ''): string => (v === null || v === undefined ? def : String(v));

export function aBarberia(r: Fila): Barberia {
  return {
    id: s(r.id),
    nombre: s(r.nombre),
    slug: s(r.slug),
    color: s(r.color, '#3E4A35'),
    telefono: s(r.telefono),
    direccion: s(r.direccion),
    logo: r.logo_url ? s(r.logo_url) : null,
    fidelidadMeta: n(r.fidelidad_meta, 10),
    altaEn: s(r.creado_en),
  };
}

export function aBarbero(r: Fila): Barbero {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    nombre: s(r.nombre),
    rol: r.rol === 'dueno' ? 'dueno' : 'barbero',
  };
}

export function aSilla(r: Fila): Silla {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    nombre: s(r.nombre),
    orden: Number(r.orden ?? 1),
    activa: r.activa !== false,
  };
}

export function aServicio(r: Fila): Servicio {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    nombre: s(r.nombre),
    precio: n(r.precio),
    minutos: n(r.minutos, 30),
    activo: r.activo !== false,
    orden: n(r.orden, 1),
  };
}

export function aCliente(r: Fila): Cliente {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    codigo: s(r.codigo),
    tokenPublico: s(r.token_publico),
    nombre: s(r.nombre),
    telefono: s(r.telefono),
    comoCorta: s(r.como_corta),
    notas: s(r.notas),
    preferencias: s(r.preferencias),
    consentimientos: {
      datos: r.cons_datos !== false,
      avisos: r.cons_avisos === true,
      marketing: r.cons_marketing === true,
    },
    creadoEn: s(r.creado_en),
  };
}

export function aLlavero(r: Fila): Llavero {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    token: s(r.token),
    codigoCorto: s(r.codigo_corto),
    lote: s(r.lote),
    estado: r.estado === 'activo' ? 'activo' : r.estado === 'retirado' ? 'retirado' : 'sin_asignar',
    clienteId: r.cliente_id ? s(r.cliente_id) : null,
    creadoEn: s(r.creado_en),
    asignadoEn: r.asignado_en ? s(r.asignado_en) : null,
    retiradoEn: r.retirado_en ? s(r.retirado_en) : null,
  };
}

export function aCita(r: Fila): Cita {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    servicioId: s(r.servicio_id),
    sillaId: r.silla_id ? s(r.silla_id) : null,
    inicio: s(r.inicio),
    estado: (r.estado ?? 'pendiente') as Cita['estado'],
    origen: (r.origen ?? 'manual') as Cita['origen'],
    nota: s(r.nota),
  };
}

export function aCola(r: Fila): ColaItem {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    sillaId: r.silla_id ? s(r.silla_id) : null,
    servicioId: r.servicio_id ? s(r.servicio_id) : null,
    estado: (r.estado ?? 'esperando') as ColaItem['estado'],
    llegadaEn: s(r.llegada_en),
    inicioEn: r.inicio_en ? s(r.inicio_en) : null,
    finEn: r.fin_en ? s(r.fin_en) : null,
    origen: (r.origen ?? 'mostrador') as ColaItem['origen'],
  };
}

export function aVisita(r: Fila): Visita {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    servicioId: s(r.servicio_id),
    fecha: s(r.fecha),
    precio: n(r.precio),
    pagado: r.pagado === true,
    metodo: (r.metodo ?? null) as Visita['metodo'],
  };
}

export function aMovimiento(r: Fila): Movimiento {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    tipo: (r.tipo ?? 'corte') as Movimiento['tipo'],
    fecha: s(r.fecha),
    nota: s(r.nota),
  };
}

export function aRecompensa(r: Fila): Recompensa {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    estado: r.estado === 'aplicada' ? 'aplicada' : 'disponible',
    creadaEn: s(r.creada_en),
    aplicadaEn: r.aplicada_en ? s(r.aplicada_en) : null,
  };
}

export function aMensaje(r: Fila): Mensaje {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: s(r.cliente_id),
    tipo: (r.tipo ?? 'confirmacion') as Mensaje['tipo'],
    canal: (r.canal ?? 'whatsapp') as Mensaje['canal'],
    estado: 'simulado',
    fecha: s(r.fecha),
    texto: s(r.texto),
  };
}

export function aEvento(r: Fila): Evento {
  return {
    id: s(r.id),
    barberiaId: s(r.barberia_id),
    clienteId: r.cliente_id ? s(r.cliente_id) : undefined,
    tipo: s(r.tipo) as Evento['tipo'],
    fecha: s(r.fecha),
    meta: (r.meta ?? {}) as Evento['meta'],
  };
}

/** Cuerpo de un `Db` vacío, para mientras carga o cuando el local no tiene nada. */
export function dbVacio(barberia: Barberia): Db {
  return {
    version: 0,
    barberias: [barberia],
    barberos: [],
    sillas: [],
    servicios: [],
    clientes: [],
    llaveros: [],
    citas: [],
    cola: [],
    visitas: [],
    movimientos: [],
    recompensas: [],
    mensajes: [],
    eventos: [],
    sesion: null,
  };
}
