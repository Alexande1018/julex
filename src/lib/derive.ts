import type {
  Barberia,
  Cita,
  Cliente,
  ColaItem,
  Db,
  EstadoCita,
  ID,
  Llavero,
  Iso,
  Servicio,
  Silla,
  Visita,
} from './types';
import { addDays, diasDesde, fmtFechaCorta, startOfDay, toDate } from './format';

/* ------------------------------------------------------------------ */
/* Barbería activa                                                     */
/* ------------------------------------------------------------------ */

export function barberiaActiva(db: Db): Barberia {
  const id = db.sesion?.barberiaId;
  return db.barberias.find((b) => b.id === id) ?? db.barberias[0];
}

export function barberiaPorSlug(db: Db, slug: string): Barberia | undefined {
  return db.barberias.find((b) => b.slug === slug);
}

export function sillasDe(db: Db, barberiaId: ID): Silla[] {
  return (db.sillas ?? [])
    .filter((s) => s.barberiaId === barberiaId)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/** Primera silla libre en un tramo, por orden. Null si están todas cogidas. */
export function sillaLibre(
  db: Db,
  barberiaId: ID,
  inicio: Iso,
  minutos: number,
): Silla | undefined {
  const desde = toDate(inicio).getTime();
  const hasta = desde + minutos * 60000;
  return sillasDe(db, barberiaId)
    .filter((s) => s.activa)
    .find((silla) => {
      const suyas = db.citas.filter(
        (c) =>
          c.sillaId === silla.id &&
          (c.estado === 'pendiente' || c.estado === 'confirmada'),
      );
      return !suyas.some((c) => {
        const ini = toDate(c.inicio).getTime();
        const fin = ini + (servicioDe(db, c.servicioId)?.minutos ?? 30) * 60000;
        return ini < hasta && fin > desde;
      });
    });
}

export function sillaDe(db: Db, id: ID | null | undefined): Silla | undefined {
  if (!id) return undefined;
  return (db.sillas ?? []).find((s) => s.id === id);
}

export function serviciosDe(db: Db, barberiaId: ID): Servicio[] {
  return db.servicios.filter((s) => s.barberiaId === barberiaId && s.activo);
}

export function servicioDe(db: Db, id: ID | null | undefined): Servicio | undefined {
  if (!id) return undefined;
  return db.servicios.find((s) => s.id === id);
}

export function clienteDe(db: Db, id: ID | null | undefined): Cliente | undefined {
  if (!id) return undefined;
  return db.clientes.find((c) => c.id === id);
}

export function clientePorCodigo(db: Db, codigo: string): Cliente | undefined {
  const limpio = codigo.trim().toUpperCase();
  return db.clientes.find((c) => c.codigo.toUpperCase() === limpio);
}

/** Enlace público de la tarjeta: token, nunca el código interno. */
export function clientePorToken(db: Db, token: string): Cliente | undefined {
  const limpio = token.trim();
  return db.clientes.find((c) => c.tokenPublico === limpio);
}

/* ------------------------------------------------------------------ */
/* Cliente: historial y fidelización                                   */
/* ------------------------------------------------------------------ */

export function visitasDe(db: Db, clienteId: ID): Visita[] {
  return db.visitas
    .filter((v) => v.clienteId === clienteId)
    .sort((a, b) => toDate(b.fecha).getTime() - toDate(a.fecha).getTime());
}

export function cortesDe(db: Db, clienteId: ID): number {
  return db.visitas.filter((v) => v.clienteId === clienteId).length;
}

export function ultimaVisita(db: Db, clienteId: ID): string | null {
  const v = visitasDe(db, clienteId)[0];
  return v ? v.fecha : null;
}

export interface Fidelidad {
  meta: number;
  cortes: number;
  enCiclo: number;
  faltan: number;
  disponibles: number;
  aplicadas: number;
  /** true cuando el ciclo está completo y toca corte gratis */
  cicloCompleto: boolean;
}

export function fidelidadDe(db: Db, cliente: Cliente): Fidelidad {
  const barberia = db.barberias.find((b) => b.id === cliente.barberiaId)!;
  const meta = Math.max(1, barberia.fidelidadMeta);
  const cortes = cortesDe(db, cliente.id);
  const disponibles = db.recompensas.filter(
    (r) => r.clienteId === cliente.id && r.estado === 'disponible',
  ).length;
  const aplicadas = db.recompensas.filter(
    (r) => r.clienteId === cliente.id && r.estado === 'aplicada',
  ).length;
  // El ciclo se cuenta por restos, y una recompensa sin canjear llena la tarjeta.
  const restante = cortes % meta;
  const cicloCompleto = disponibles > 0;
  const enCiclo = cicloCompleto ? meta : restante;
  const faltan = cicloCompleto ? 0 : meta - restante;
  return { meta, cortes, enCiclo, faltan, disponibles, aplicadas, cicloCompleto };
}

export function llaveroDeCliente(db: Db, clienteId: ID): Llavero | undefined {
  return db.llaveros.find((l) => l.clienteId === clienteId && l.estado === 'activo');
}

export function llaveroPorToken(db: Db, token: string): Llavero | undefined {
  return db.llaveros.find((l) => l.token === token);
}

/* ------------------------------------------------------------------ */
/* Cola del día                                                        */
/* ------------------------------------------------------------------ */

export interface ColaDia {
  sillon: ColaItem | null;
  esperando: ColaItem[];
  terminados: ColaItem[];
  noVino: ColaItem[];
}

export function colaDelDia(db: Db, barberiaId: ID): ColaDia {
  const hoy = startOfDay(new Date()).getTime();
  const deHoy = db.cola
    .filter((q) => q.barberiaId === barberiaId)
    .filter((q) => startOfDay(q.llegadaEn).getTime() === hoy);

  const esperando = deHoy
    .filter((q) => q.estado === 'esperando')
    .sort((a, b) => toDate(a.llegadaEn).getTime() - toDate(b.llegadaEn).getTime());

  return {
    sillon: deHoy.find((q) => q.estado === 'sillon') ?? null,
    esperando,
    terminados: deHoy
      .filter((q) => q.estado === 'terminado')
      .sort((a, b) => toDate(b.finEn ?? b.llegadaEn).getTime() - toDate(a.finEn ?? a.llegadaEn).getTime()),
    noVino: deHoy.filter((q) => q.estado === 'no_vino'),
  };
}

/** 1-based, o null si no está en la cola. */
export function posicionEnCola(cola: ColaDia, clienteId: ID): number | null {
  const i = cola.esperando.findIndex((q) => q.clienteId === clienteId);
  return i === -1 ? null : i + 1;
}

/* ------------------------------------------------------------------ */
/* Citas                                                               */
/* ------------------------------------------------------------------ */

export function citasDelDia(db: Db, barberiaId: ID, dia: Date): Cita[] {
  return db.citas
    .filter((c) => c.barberiaId === barberiaId)
    .filter((c) => startOfDay(c.inicio).getTime() === startOfDay(dia).getTime())
    .sort((a, b) => toDate(a.inicio).getTime() - toDate(b.inicio).getTime());
}

export function citaProxima(db: Db, clienteId: ID): Cita | undefined {
  const ahora = Date.now();
  return db.citas
    .filter(
      (c) =>
        c.clienteId === clienteId &&
        (c.estado === 'pendiente' || c.estado === 'confirmada') &&
        toDate(c.inicio).getTime() >= ahora - 60_000,
    )
    .sort((a, b) => toDate(a.inicio).getTime() - toDate(b.inicio).getTime())[0];
}

export function citasFuturasDe(db: Db, clienteId: ID): Cita[] {
  const ahora = Date.now();
  return db.citas
    .filter(
      (c) =>
        c.clienteId === clienteId &&
        (c.estado === 'pendiente' || c.estado === 'confirmada') &&
        toDate(c.inicio).getTime() >= ahora,
    )
    .sort((a, b) => toDate(a.inicio).getTime() - toDate(b.inicio).getTime());
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function llaverosActivos(db: Db, barberiaId: ID): number {
  return db.llaveros.filter((l) => l.barberiaId === barberiaId && l.estado === 'activo').length;
}

export function resumenLlaveros(db: Db, barberiaId: ID) {
  const propios = db.llaveros.filter((l) => l.barberiaId === barberiaId);
  return {
    total: propios.length,
    activos: propios.filter((l) => l.estado === 'activo').length,
    sinAsignar: propios.filter((l) => l.estado === 'sin_asignar').length,
    retirados: propios.filter((l) => l.estado === 'retirado').length,
  };
}

/** La cuota que JULEX factura: mínimo 15 €/mes, 1 € por llavero activo. */
export const CUOTA_MINIMA = 15;

export function cuotaMensual(db: Db, barberiaId: ID): { activos: number; cuota: number; minimo: boolean } {
  const activos = llaverosActivos(db, barberiaId);
  return { activos, cuota: Math.max(CUOTA_MINIMA, activos), minimo: activos < CUOTA_MINIMA };
}

export function ingresosEntre(db: Db, barberiaId: ID, desde: Date, hasta: Date): number {
  const a = startOfDay(desde).getTime();
  const b = startOfDay(addDays(hasta, 1)).getTime();
  return db.visitas
    .filter((v) => v.barberiaId === barberiaId)
    .filter((v) => {
      const t = toDate(v.fecha).getTime();
      return t >= a && t < b;
    })
    .reduce((s, v) => s + v.precio, 0);
}

export function ingresosDelMes(db: Db, barberiaId: ID): number {
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return ingresosEntre(db, barberiaId, desde, hoy);
}

export interface Semana {
  etiqueta: string;
  visitas: number;
  ingresos: number;
}

export function actividadSemanal(db: Db, barberiaId: ID, semanas = 8): Semana[] {
  const hoy = startOfDay(new Date());
  const salida: Semana[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const fin = addDays(hoy, -7 * i);
    const ini = addDays(fin, -6);
    const a = startOfDay(ini).getTime();
    const b = startOfDay(addDays(fin, 1)).getTime();
    const visitas = db.visitas.filter((v) => {
      if (v.barberiaId !== barberiaId) return false;
      const t = toDate(v.fecha).getTime();
      return t >= a && t < b;
    });
    salida.push({
      etiqueta: fmtFechaCorta(ini),
      visitas: visitas.length,
      ingresos: visitas.reduce((s, v) => s + v.precio, 0),
    });
  }
  return salida;
}

export function clientesActivos(db: Db, barberiaId: ID, dias = 30): Cliente[] {
  return db.clientes.filter((c) => {
    if (c.barberiaId !== barberiaId) return false;
    const u = ultimaVisita(db, c.id);
    return !!u && diasDesde(u) <= dias;
  });
}

export function clientesInactivos(db: Db, barberiaId: ID, dias = 30): { cliente: Cliente; dias: number }[] {
  return db.clientes
    .filter((c) => c.barberiaId === barberiaId)
    .map((c) => ({ cliente: c, ultima: ultimaVisita(db, c.id) }))
    .filter((x) => !!x.ultima && diasDesde(x.ultima!) > dias)
    .filter((x) => citasFuturasDe(db, x.cliente.id).length === 0)
    .map((x) => ({ cliente: x.cliente, dias: diasDesde(x.ultima!) }))
    .sort((a, b) => b.dias - a.dias);
}

/* ------------------------------------------------------------------ */
/* Etiquetas                                                           */
/* ------------------------------------------------------------------ */

export const ETIQUETA_CITA: Record<EstadoCita, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  atendida: 'Atendida',
  no_vino: 'No vino',
  cancelada: 'Cancelada',
};

export const ETIQUETA_ORIGEN: Record<string, string> = {
  qr: 'QR',
  llavero: 'Llavero',
  manual: 'Mostrador',
  web: 'Web',
  mostrador: 'Mostrador',
};

export const ETIQUETA_LLAVERO: Record<string, string> = {
  sin_asignar: 'Sin asignar',
  activo: 'Activo',
  retirado: 'Retirado',
};
