/**
 * El vocabulario de cada tipo de negocio.
 *
 * La entidad `barberias` sirve igual para una barbería, una peluquería, un
 * salón de uñas o un estudio de tatuaje. Lo que cambia no es el modelo, es
 * cómo se llama cada cosa en pantalla. Este módulo es el único sitio donde
 * viven esos nombres: ninguna pantalla debería escribir «sillón» a mano.
 *
 * Los servicios, precios, duraciones y puestos siguen siendo datos de cada
 * local: esto solo cambia las etiquetas y los valores con los que nace.
 */

import type { TipoNegocio } from './types';

export type { TipoNegocio };

export interface Vocabulario {
  tipo: TipoNegocio;
  /** Cómo se llama el negocio: «Barbería». */
  etiqueta: string;
  /** Título de la pantalla: «La cola», «La agenda», «Citas». */
  cola: string;
  /** Pestaña de navegación: «Cola», «Agenda». */
  navCola: string;
  /** Minúscula para frases: «en la cola», «en la agenda». */
  colaMin: string;
  /** Dónde se atiende: «Sillón». */
  puesto: string;
  puestoMin: string;
  puestos: string;
  /** «En sillón», «En mesa». */
  enPuesto: string;
  puestoOcupado: string;
  /** «Pasar al sillón». */
  pasarAPuesto: string;
  /** El bloque de la ficha: «Cómo corta». */
  comoAtiende: string;
  /** Lo que se hace: «Corte», «Sesión». */
  servicio: string;
  servicioMin: string;
  servicios: string;
  serviciosMin: string;
}

export const VOCABULARIO: Record<TipoNegocio, Vocabulario> = {
  barberia: {
    tipo: 'barberia',
    etiqueta: 'Barbería',
    cola: 'La cola',
    navCola: 'Cola',
    colaMin: 'cola',
    puesto: 'Sillón',
    puestoMin: 'sillón',
    puestos: 'Sillones',
    enPuesto: 'En sillón',
    puestoOcupado: 'Sillón ocupado',
    pasarAPuesto: 'Pasar al sillón',
    comoAtiende: 'Cómo corta',
    servicio: 'Corte',
    servicioMin: 'corte',
    servicios: 'Cortes',
    serviciosMin: 'cortes',
  },
  peluqueria: {
    tipo: 'peluqueria',
    etiqueta: 'Peluquería',
    cola: 'La agenda',
    navCola: 'Agenda',
    colaMin: 'agenda',
    puesto: 'Puesto',
    puestoMin: 'puesto',
    puestos: 'Puestos',
    enPuesto: 'En puesto',
    puestoOcupado: 'Puesto ocupado',
    pasarAPuesto: 'Pasar al puesto',
    comoAtiende: 'Preferencias de estilo',
    servicio: 'Servicio',
    servicioMin: 'servicio',
    servicios: 'Servicios',
    serviciosMin: 'servicios',
  },
  unas: {
    tipo: 'unas',
    etiqueta: 'Salón de uñas',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Mesa',
    puestoMin: 'mesa',
    puestos: 'Mesas',
    enPuesto: 'En mesa',
    puestoOcupado: 'Mesa ocupada',
    pasarAPuesto: 'Pasar a la mesa',
    comoAtiende: 'Diseño y preferencias',
    servicio: 'Servicio',
    servicioMin: 'servicio',
    servicios: 'Servicios',
    serviciosMin: 'servicios',
  },
  tatuaje: {
    tipo: 'tatuaje',
    etiqueta: 'Estudio de tatuaje',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Estación',
    puestoMin: 'estación',
    puestos: 'Estaciones',
    enPuesto: 'En estación',
    puestoOcupado: 'Estación ocupada',
    pasarAPuesto: 'Pasar a la estación',
    comoAtiende: 'Diseño y notas del proyecto',
    servicio: 'Sesión',
    servicioMin: 'sesión',
    servicios: 'Sesiones',
    serviciosMin: 'sesiones',
  },
};

/** Nunca falla: sin tipo, se comporta como una barbería (el caso de siempre). */
export function vocabulario(tipo: TipoNegocio | undefined | null): Vocabulario {
  return VOCABULARIO[tipo ?? 'barberia'] ?? VOCABULARIO.barberia;
}

export const TIPOS: { tipo: TipoNegocio; etiqueta: string; pista: string }[] = [
  { tipo: 'barberia', etiqueta: 'Barbería', pista: 'Cola, sillón, cómo corta' },
  { tipo: 'peluqueria', etiqueta: 'Peluquería', pista: 'Agenda, puesto, preferencias de estilo' },
  { tipo: 'unas', etiqueta: 'Salón de uñas', pista: 'Citas, mesa, diseño y preferencias' },
  { tipo: 'tatuaje', etiqueta: 'Estudio de tatuaje', pista: 'Citas, estación, notas del proyecto' },
];
