/**
 * El vocabulario de cada tipo de negocio.
 *
 * La entidad `barberias` sirve igual para una barbería, una peluquería, un
 * salón de uñas o un centro de estética. Lo que cambia no es el modelo, es
 * cómo se llama cada cosa en pantalla. Este módulo es el único sitio donde
 * viven esos nombres: ninguna pantalla debería escribir «sillón» a mano.
 *
 * Los servicios, precios, duraciones y puestos siguen siendo datos de cada
 * local: esto solo cambia las etiquetas y los valores con los que nace.
 *
 * Un oficio entra aquí solo si cambia al menos dos de estas cuatro cosas:
 * cómo se llama el puesto, cómo se llama el servicio, qué se apunta en la
 * ficha del cliente y con qué servicios nace. Si no cambia nada de eso, es
 * una etiqueta comercial, no un oficio.
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
  estetica: {
    tipo: 'estetica',
    etiqueta: 'Centro de estética',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Cabina',
    puestoMin: 'cabina',
    puestos: 'Cabinas',
    enPuesto: 'En cabina',
    puestoOcupado: 'Cabina ocupada',
    pasarAPuesto: 'Pasar a la cabina',
    comoAtiende: 'Tipo de piel y preferencias',
    servicio: 'Tratamiento',
    servicioMin: 'tratamiento',
    servicios: 'Tratamientos',
    serviciosMin: 'tratamientos',
  },
  depilacion: {
    tipo: 'depilacion',
    etiqueta: 'Centro de depilación',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Cabina',
    puestoMin: 'cabina',
    puestos: 'Cabinas',
    enPuesto: 'En cabina',
    puestoOcupado: 'Cabina ocupada',
    pasarAPuesto: 'Pasar a la cabina',
    comoAtiende: 'Zonas y tolerancia',
    servicio: 'Sesión',
    servicioMin: 'sesión',
    servicios: 'Sesiones',
    serviciosMin: 'sesiones',
  },
  canina: {
    tipo: 'canina',
    etiqueta: 'Peluquería canina',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Mesa',
    puestoMin: 'mesa',
    puestos: 'Mesas',
    enPuesto: 'En mesa',
    puestoOcupado: 'Mesa ocupada',
    pasarAPuesto: 'Pasar a la mesa',
    comoAtiende: 'Ficha del perro',
    servicio: 'Servicio',
    servicioMin: 'servicio',
    servicios: 'Servicios',
    serviciosMin: 'servicios',
  },
  spa: {
    tipo: 'spa',
    etiqueta: 'Spa',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Camilla',
    puestoMin: 'camilla',
    puestos: 'Camillas',
    enPuesto: 'En camilla',
    puestoOcupado: 'Camilla ocupada',
    pasarAPuesto: 'Pasar a la camilla',
    comoAtiende: 'Preferencias y alergias',
    servicio: 'Sesión',
    servicioMin: 'sesión',
    servicios: 'Sesiones',
    serviciosMin: 'sesiones',
  },
  auto: {
    tipo: 'auto',
    etiqueta: 'Lavado y estética del auto',
    cola: 'La cola',
    navCola: 'Cola',
    colaMin: 'cola',
    puesto: 'Bahía',
    puestoMin: 'bahía',
    puestos: 'Bahías',
    enPuesto: 'En bahía',
    puestoOcupado: 'Bahía ocupada',
    pasarAPuesto: 'Pasar a la bahía',
    comoAtiende: 'Ficha del vehículo',
    servicio: 'Lavado',
    servicioMin: 'lavado',
    servicios: 'Lavados',
    serviciosMin: 'lavados',
  },
  taller: {
    tipo: 'taller',
    etiqueta: 'Taller mecánico',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Box',
    puestoMin: 'box',
    puestos: 'Boxes',
    enPuesto: 'En box',
    puestoOcupado: 'Box ocupado',
    pasarAPuesto: 'Pasar al box',
    comoAtiende: 'Ficha del vehículo',
    servicio: 'Servicio',
    servicioMin: 'servicio',
    servicios: 'Servicios',
    serviciosMin: 'servicios',
  },
  otro: {
    tipo: 'otro',
    etiqueta: 'Otros servicios',
    cola: 'Citas',
    navCola: 'Citas',
    colaMin: 'citas',
    puesto: 'Puesto',
    puestoMin: 'puesto',
    puestos: 'Puestos',
    enPuesto: 'En puesto',
    puestoOcupado: 'Puesto ocupado',
    pasarAPuesto: 'Pasar al puesto',
    comoAtiende: 'Notas del cliente',
    servicio: 'Servicio',
    servicioMin: 'servicio',
    servicios: 'Servicios',
    serviciosMin: 'servicios',
  },
};

/** Nunca falla: sin tipo, se comporta como una barbería (el caso de siempre). */
export function vocabulario(tipo: TipoNegocio | undefined | null): Vocabulario {
  return VOCABULARIO[tipo ?? 'barberia'] ?? VOCABULARIO.barberia;
}

/**
 * Los oficios en el orden en que se ofrecen. Los cuatro primeros son los de
 * siempre, para que el selector no cambie de sitio a quien ya lo conocía.
 */
export const TIPOS: { tipo: TipoNegocio; etiqueta: string }[] = [
  { tipo: 'barberia', etiqueta: 'Barbería' },
  { tipo: 'peluqueria', etiqueta: 'Peluquería' },
  { tipo: 'unas', etiqueta: 'Salón de uñas' },
  { tipo: 'tatuaje', etiqueta: 'Estudio de tatuaje' },
  { tipo: 'estetica', etiqueta: 'Centro de estética' },
  { tipo: 'depilacion', etiqueta: 'Centro de depilación' },
  { tipo: 'canina', etiqueta: 'Peluquería canina' },
  { tipo: 'spa', etiqueta: 'Spa' },
  { tipo: 'auto', etiqueta: 'Lavado y estética del auto' },
  { tipo: 'taller', etiqueta: 'Taller mecánico' },
  { tipo: 'otro', etiqueta: 'Otros servicios' },
];
