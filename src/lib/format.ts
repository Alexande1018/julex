const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

export function startOfDay(v: string | Date): Date {
  const d = toDate(v);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(v: string | Date, n: number): Date {
  const d = new Date(toDate(v).getTime());
  d.setDate(d.getDate() + n);
  return d;
}

export function addMinutes(v: string | Date, n: number): Date {
  return new Date(toDate(v).getTime() + n * 60_000);
}

export function mismoDia(a: string | Date, b: string | Date): boolean {
  const x = toDate(a);
  const y = toDate(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function esHoy(v: string | Date): boolean {
  return mismoDia(v, new Date());
}

export function esManana(v: string | Date): boolean {
  return mismoDia(v, addDays(new Date(), 1));
}

/** "14:32" */
export function fmtHora(v: string | Date): string {
  const d = toDate(v);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "martes, 10 de noviembre" */
export function fmtFecha(v: string | Date): string {
  const d = toDate(v);
  const s = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "10 nov" */
export function fmtFechaCorta(v: string | Date): string {
  const d = toDate(v);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** "10/11/2026" */
export function fmtFechaNum(v: string | Date): string {
  const d = toDate(v);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function etiquetaDia(v: string | Date): string {
  if (esHoy(v)) return 'Hoy';
  if (esManana(v)) return 'Mañana';
  const d = toDate(v);
  return `${DIAS[d.getDay()].charAt(0).toUpperCase()}${DIAS[d.getDay()].slice(1)}, ${d.getDate()} de ${
    MESES[d.getMonth()]
  }`;
}

export function diasDesde(v: string | Date): number {
  const ms = startOfDay(new Date()).getTime() - startOfDay(v).getTime();
  return Math.round(ms / 86_400_000);
}

export function diasHasta(v: string | Date): number {
  return -diasDesde(v);
}

export function haceCuanto(v: string | Date): string {
  const dif = Date.now() - toDate(v).getTime();
  const min = Math.floor(dif / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = diasDesde(v);
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

/** "hace 18 días" o "hoy", para la ficha */
export function ultimaVisitaTexto(v: string | Date | null): string {
  if (!v) return 'Sin visitas todavía';
  const d = diasDesde(v);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

/** "12:04" o "1:02:33" */
export function cronometro(desde: string | Date): string {
  const ms = Math.max(0, Date.now() - toDate(desde).getTime());
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtEuros(n: number): string {
  const redondo = Math.round(n * 100) / 100;
  const txt = Number.isInteger(redondo)
    ? String(redondo)
    : redondo.toFixed(2).replace('.', ',');
  return `${txt} €`;
}

export function fmtDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/** Quita acentos y mayúsculas para buscar. */
export function normaliza(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buscarTexto(texto: string, consulta: string): boolean {
  const q = normaliza(consulta.trim());
  if (!q) return true;
  return normaliza(texto).includes(q);
}

export function telefonoBonito(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return t;
}

export function rangoSemana(inicio: Date): string {
  return `${inicio.getDate()} ${MESES[inicio.getMonth()].slice(0, 3)}`;
}
