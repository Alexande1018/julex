/**
 * El horario del local: días abiertos, horas y descanso.
 *
 * Una sola idea manda en todo el archivo: si un día no tiene fila, el local
 * está cerrado. Así lo entiende la base de datos y así se edita en Ajustes.
 */
import type { Db, Horario, ID } from './types';

/** Como los cuenta Postgres: 0 es domingo y 6 sábado. */
export const NOMBRE_DIA: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

/** Lunes primero, que es como se lee una semana de trabajo. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** Una fila de la tabla de horario, ya lista para pintar y editar. */
export interface DiaHorario {
  dia: number;
  abierto: boolean;
  /** HH:MM */
  abre: string;
  /** HH:MM */
  cierra: string;
  descanso: boolean;
  /** HH:MM */
  descansoDesde: string;
  /** HH:MM */
  descansoHasta: string;
}

const POR_DEFECTO = {
  abierto: true,
  abre: '10:00',
  cierra: '20:00',
  descanso: false,
  descansoDesde: '14:00',
  descansoHasta: '15:00',
};

/** Deja una hora en HH:MM venga como venga (09:30, 9:30:00). */
export function hhmm(valor?: string | null): string {
  const t = String(valor ?? '').trim();
  if (!t) return '';
  const [h = '0', m = '00'] = t.split(':');
  return `${h.padStart(2, '0')}:${m.slice(0, 2).padEnd(2, '0')}`;
}

/** Minutos desde medianoche. Para comparar horas sin líos. */
export function minutosDe(hora: string): number {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** La semana entera del local, con los días cerrados incluidos. */
export function horarioSemanal(db: Db, barberiaId: ID): DiaHorario[] {
  return ORDEN_SEMANA.map((dia) => {
    const h = (db.horarios ?? []).find((x) => x.barberiaId === barberiaId && x.dia === dia);
    if (!h) return { dia, ...POR_DEFECTO, abierto: false };
    const descanso = Boolean(h.descansoDesde && h.descansoHasta);
    return {
      dia,
      abierto: true,
      abre: hhmm(h.abre) || POR_DEFECTO.abre,
      cierra: hhmm(h.cierra) || POR_DEFECTO.cierra,
      descanso,
      descansoDesde: hhmm(h.descansoDesde) || POR_DEFECTO.descansoDesde,
      descansoHasta: hhmm(h.descansoHasta) || POR_DEFECTO.descansoHasta,
    };
  });
}

/** La fila del día de la semana (0 domingo … 6 sábado), o null si está cerrado. */
export function horarioDelDia(db: Db, barberiaId: ID, dia: number): Horario | null {
  return (
    (db.horarios ?? []).find((x) => x.barberiaId === barberiaId && x.dia === dia) ?? null
  );
}

/** ¿El tramo [inicio, inicio+minutos) pisa el descanso? */
export function pisaDescanso(h: Horario, inicio: string, minutos: number): boolean {
  if (!h.descansoDesde || !h.descansoHasta) return false;
  const ini = minutosDe(inicio);
  return ini < minutosDe(h.descansoHasta) && ini + minutos > minutosDe(h.descansoDesde);
}

/** Devuelve el mensaje del primer fallo, o null si la semana es válida. */
export function validarHorario(dias: DiaHorario[]): string | null {
  for (const d of dias) {
    if (!d.abierto) continue;
    const nombre = NOMBRE_DIA[d.dia] ?? `Día ${d.dia}`;
    if (!d.abre || !d.cierra) return `${nombre}: falta la hora de apertura o la de cierre.`;
    if (minutosDe(d.abre) >= minutosDe(d.cierra)) {
      return `${nombre}: el cierre tiene que ser posterior a la apertura.`;
    }
    if (!d.descanso) continue;
    if (!d.descansoDesde || !d.descansoHasta) {
      return `${nombre}: el descanso necesita hora de inicio y de fin.`;
    }
    if (minutosDe(d.descansoDesde) >= minutosDe(d.descansoHasta)) {
      return `${nombre}: el descanso termina antes de empezar.`;
    }
    if (minutosDe(d.descansoDesde) < minutosDe(d.abre) || minutosDe(d.descansoHasta) > minutosDe(d.cierra)) {
      return `${nombre}: el descanso tiene que caber dentro del horario de apertura.`;
    }
  }
  return null;
}

/** Los códigos que lanza `guardar_horario()` en Postgres, en castellano. */
export function mensajeErrorHorario(mensaje: string): string {
  const tabla: Record<string, string> = {
    sin_local: 'No hemos podido identificar tu local.',
    horario_invalido: 'El horario no tiene el formato esperado.',
    dia_invalido: 'Hay un día que no existe.',
    dia_repetido: 'Hay un día repetido.',
    hora_invalida: 'Falta una hora de apertura o de cierre.',
    horas_invertidas: 'La hora de cierre tiene que ser posterior a la de apertura.',
    descanso_incompleto: 'El descanso necesita hora de inicio y de fin.',
    descanso_invertido: 'El descanso termina antes de empezar.',
    descanso_fuera: 'El descanso tiene que caber dentro del horario de apertura.',
  };
  for (const [codigo, texto] of Object.entries(tabla)) {
    if (mensaje.includes(codigo)) return texto;
  }
  return mensaje;
}
