// JULEX · las caras de la recepcionista
//
// No son fotos ni imágenes descargadas: se dibujan con formas y colores
// calculados a partir del id. Así no cuestan nada, no dependen de la red y
// el mismo avatar se ve igual hoy y dentro de un año.

export interface AvatarDef {
  id: string;
  nombre: string;
}

export const AVATARES: AvatarDef[] = [
  { id: 'nico', nombre: 'Nico' },
  { id: 'sofia', nombre: 'Sofía' },
  { id: 'lola', nombre: 'Lola' },
  { id: 'dante', nombre: 'Dante' },
  { id: 'julia', nombre: 'Julia' },
  { id: 'bruno', nombre: 'Bruno' },
  { id: 'alba', nombre: 'Alba' },
  { id: 'marcos', nombre: 'Marcos' },
  { id: 'vera', nombre: 'Vera' },
  { id: 'leo', nombre: 'Leo' },
  { id: 'nadia', nombre: 'Nadia' },
  { id: 'hugo', nombre: 'Hugo' },
];

/** Paletas cálidas y apagadas, en la misma familia que la app. */
const FONDOS: Array<[string, string]> = [
  ['#7c8a76', '#42503e'],
  ['#b08a67', '#6f5038'],
  ['#c08063', '#7c4734'],
  ['#a9a18e', '#655d4f'],
  ['#8f9c93', '#4f5f57'],
  ['#c4a87c', '#8a6a46'],
  ['#8a8f98', '#4f555d'],
  ['#b07a6a', '#6e443a'],
];

const PIELES = ['#f3d7c1', '#ebc3a8', '#dda985', '#c98e68', '#ae7350', '#8b583d', '#71442f'];

const PELOS = ['#241f1a', '#3c2d23', '#5a412c', '#755437', '#987447', '#b89a68', '#4a4a46', '#8b857a'];

const ROPAS = ['#3e4a35', '#6a5440', '#8a5c46', '#4b5450', '#6e7b5f', '#7c6a4f', '#a2553c'];

export type CortePelo = 0 | 1 | 2 | 3;

export interface AvatarSpec {
  id: string;
  /** Degradado del círculo: de claro a oscuro. */
  fondo: [string, string];
  piel: string;
  pelo: string;
  ropa: string;
  corte: CortePelo;
  barba: boolean;
  gafas: boolean;
  aretes: boolean;
}

/**
 * Hash FNV-1a de 32 bits. Es determinista, no usa Math.random y funciona
 * igual en cualquier navegador.
 */
export function avatarSemilla(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Barba, gafas y aretes de los doce avatares con nombre. El resto de
 * combinaciones sale del hash; estos rasgos se eligen a mano para que la
 * rejilla tenga caras distintas y no cinco clones con gafas.
 */
const RASGOS: Record<string, { barba?: boolean; gafas?: boolean; aretes?: boolean }> = {
  nico: {},
  sofia: { aretes: true },
  lola: { gafas: true },
  dante: { barba: true },
  julia: { aretes: true },
  bruno: { barba: true },
  alba: { gafas: true, aretes: true },
  marcos: { barba: true },
  vera: { aretes: true },
  leo: {},
  nadia: { gafas: true },
  hugo: { barba: true, gafas: true },
};

/**
 * Todas las piezas del dibujo. La semilla opcional sirve para forzar una
 * variante; sin ella se calcula con el id.
 */
export function avatarSvg(id: string, semilla?: number): AvatarSpec {
  const base = (semilla ?? avatarSemilla(id)) >>> 0;
  // Cada rasgo mezcla el hash del id con la semilla para que no vayan todos
  // correlacionados y dos avatares no salgan con el mismo conjunto.
  const indice = (sal: string, mod: number) => ((avatarSemilla(`${id}:${sal}`) ^ base) >>> 0) % mod;

  const conocido = RASGOS[id];
  const corte = indice('corte', 4) as CortePelo;

  return {
    id,
    fondo: FONDOS[indice('fondo', FONDOS.length)],
    piel: PIELES[indice('piel', PIELES.length)],
    pelo: PELOS[indice('pelo', PELOS.length)],
    ropa: ROPAS[indice('ropa', ROPAS.length)],
    corte,
    barba: conocido ? conocido.barba === true : indice('barba', 6) === 0,
    gafas: conocido ? conocido.gafas === true : indice('gafas', 6) === 0,
    aretes: conocido ? conocido.aretes === true : indice('aretes', 4) === 0,
  };
}
