/** Identificadores internos y tokens de llavero. */

export function uid(prefijo = 'id'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefijo}_${rnd}`;
}

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Token opaco para la URL del chip. No secuencial, no revela al cliente. */
export function tokenLlavero(largo = 12): string {
  let out = '';
  const bytes = new Uint8Array(largo);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < largo; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < largo; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

/** Código legible para el barbero: PBL-7K4Q */
export function codigoCorto(prefijo = 'PBL'): string {
  const bloque = () =>
    Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)])
      .join('')
      .toUpperCase();
  return `${prefijo}-${bloque().slice(0, 2)}${bloque().slice(0, 2)}`;
}

/** P-0001 → P-0006 */
export function siguienteCodigoCliente(existentes: string[]): string {
  const nums = existentes
    .map((c) => Number(c.replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `P-${String(max + 1).padStart(4, '0')}`;
}
