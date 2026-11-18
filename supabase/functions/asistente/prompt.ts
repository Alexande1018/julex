// JULEX · el prompt del asistente, construido con datos
//
// Nada de esto lo escribe una IA: se arma con los servicios, horarios y
// reglas del local, y con lo que JULEX ya sabe del cliente. Determinista,
// barato y revisable.

export interface Servicio {
  nombre: string;
  precio: number;
  minutos: number;
}

export interface Horario {
  dia: string;
  abre: string;
  cierra: string;
  descanso_desde?: string | null;
  descanso_hasta?: string | null;
}

export interface DatosLocal {
  nombre: string;
  direccion?: string;
  telefono?: string;
  asistente?: string | null;
  servicios: Servicio[];
  horarios: Horario[];
}

export interface DatosCliente {
  nombre: string;
  sellos?: { en_ciclo: number; meta: number; faltan: number; disponibles: number };
  proxima?: { inicio: string; servicio: string; silla?: string | null } | null;
  ultimaVisita?: string | null;
}

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaHora = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
const fecha = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'long',
});

function dia(iso: string): string {
  try {
    return fechaHora.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function construirSistema(local: DatosLocal, cliente: DatosCliente): string {
  const nombreAsistente = (local.asistente ?? '').trim();
  const quien = nombreAsistente
    ? `Te llamas ${nombreAsistente} y eres el asistente virtual de ${local.nombre}.`
    : `Eres el asistente virtual de ${local.nombre}.`;

  const servicios = local.servicios
    .map((s) => `- ${s.nombre}: ${euros.format(s.precio)}, ${s.minutos} min`)
    .join('\n');

  const horarios = local.horarios
    .map((h) => {
      const descanso =
        h.descanso_desde && h.descanso_hasta ? ` (descanso ${h.descanso_desde}–${h.descanso_hasta})` : '';
      return `- ${h.dia}: ${h.abre}–${h.cierra}${descanso}`;
    })
    .join('\n');

  const s = cliente.sellos;
  const fidelidad = s
    ? s.disponibles > 0
      ? `Tiene un premio disponible (${s.disponibles}).`
      : `Lleva ${s.en_ciclo} de ${s.meta} sellos; le faltan ${s.faltan} para el premio.`
    : '';

  const proxima = cliente.proxima
    ? `Su próxima cita: ${dia(cliente.proxima.inicio)} (${cliente.proxima.servicio}${
        cliente.proxima.silla ? `, ${cliente.proxima.silla}` : ''
      }).`
    : 'No tiene ninguna cita próxima.';

  const ultima = cliente.ultimaVisita
    ? `Su última visita fue el ${fecha.format(new Date(cliente.ultimaVisita))}.`
    : 'Todavía no ha venido nunca.';

  const hoy = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return [
    quien,
    '',
    `Hoy es ${hoy}.`,
    '',
    `Local: ${local.nombre}.`,
    local.direccion ? `Dirección: ${local.direccion}.` : '',
    local.telefono ? `Teléfono del local: ${local.telefono}.` : '',
    '',
    'SERVICIOS Y PRECIOS (los únicos que existen):',
    servicios || '- (el local no ha cargado servicios)',
    '',
    'HORARIOS:',
    horarios || '- (el local no ha cargado horarios)',
    '',
    'QUIEN TIENE DELANTE:',
    `- Se llama ${cliente.nombre}.`,
    `- ${proxima}`,
    `- ${ultima}`,
    fidelidad ? `- ${fidelidad}` : '',
    '',
    'CÓMO TRABAJAS:',
    '- Hablas en español de España, tuteas, frases cortas y cercanas. Como mucho un emoji.',
    '- Saludas por su nombre y, si viene al caso, mencionas su cita o sus sellos.',
    '- Puedes reservar, cancelar y mover citas, y apuntar cómo quiere el corte.',
    '- Para cualquier precio, servicio u hora usa SIEMPRE las herramientas: nunca los inventes.',
    '- Antes de reservar, repite servicio, día y hora y espera confirmación.',
    '- Haz como máximo dos preguntas seguidas. Si el cliente no quiere hablar, no insistas.',
    '- Si te pide algo que no puedes hacer, o no lo entiendes, usa pasar_al_barbero.',
    '- Nunca pides datos de salud ni los comentas. Nunca hablas de otros clientes ni de su historial de dinero.',
    '- No dices que eres una persona: eres el asistente virtual del local.',
  ]
    .filter((linea) => linea !== '')
    .join('\n');
}
