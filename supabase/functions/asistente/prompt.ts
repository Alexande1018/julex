// JULEX · el prompt del recepcionista, construido con datos
//
// Nada de esto lo escribe una IA: se arma con los servicios, horarios y
// reglas del local, y con lo que JULEX ya sabe del cliente. Determinista,
// barato y revisable.
//
// El prompt no da permisos: solo describe. Si una función está apagada,
// la herramienta no existe y aquí se dice que no existe, para que el
// modelo no prometa lo que el servidor no le deja hacer.

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

export type Funciones = Record<string, boolean | undefined>;

export interface DatosLocal {
  nombre: string;
  direccion?: string;
  telefono?: string;
  asistente?: string | null;
  bienvenida?: string | null;
  personalidad?: string;
  canal?: 'llavero' | 'whatsapp';
  funciones?: Funciones;
  servicios: Servicio[];
  horarios: Horario[];
}

export interface DatosCliente {
  nombre: string;
  /** false cuando escribe un número que aún no está en ninguna ficha. */
  vinculado?: boolean;
  /** true si es el primer mensaje de la conversación. */
  primer?: boolean;
  sellos?: { en_ciclo: number; meta: number; faltan: number; disponibles: number };
  proxima?: { inicio: string; servicio: string; silla?: string | null } | null;
  ultimaVisita?: string | null;
  espera?: {
    estado: string;
    puesto: number;
    oferta?: { inicio: string; servicio: string | null; caduca?: string } | null;
  } | null;
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

/** Cómo habla. Cuatro maneras, ninguna inventada. */
const TONOS: Record<string, string> = {
  cercano: 'Hablas cercano y natural, como el que está detrás del mostrador. Tuteas.',
  formal:
    'Hablas con educación y algo de distancia: usted si el cliente lo usa primero, sin florituras.',
  divertido:
    'Hablas con humor seco y buena intención. Algún comentario ligero, nunca a costa del cliente.',
  elegante:
    'Hablas elegante y discreto: frases cuidadas, sin coloquialismos ni exclamaciones.',
};

function activa(funciones: Funciones | undefined, clave: string): boolean {
  return funciones?.[clave] !== false;
}

export function construirSistema(local: DatosLocal, cliente: DatosCliente): string {
  const funciones = local.funciones ?? {};
  const canal = local.canal ?? 'llavero';
  const nombreAsistente = (local.asistente ?? '').trim();
  const quien = nombreAsistente
    ? `Te llamas ${nombreAsistente} y eres el recepcionista virtual de ${local.nombre}.`
    : `Eres el recepcionista virtual de ${local.nombre}.`;

  const conPrecios = activa(funciones, 'precios');
  const servicios = local.servicios
    .map((s) =>
      conPrecios
        ? `- ${s.nombre}: ${euros.format(s.precio)}, ${s.minutos} min`
        : `- ${s.nombre}: ${s.minutos} min`,
    )
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

  const espera = cliente.espera
    ? cliente.espera.oferta
      ? `ESTÁ EN LISTA DE ESPERA Y TIENE UN HUECO OFRECIDO: ${dia(cliente.espera.oferta.inicio)}${
          cliente.espera.oferta.servicio ? ` (${cliente.espera.oferta.servicio})` : ''
        }. Si dice que sí, usa la herramienta oferta con aceptar en verdadero.`
      : `Está en la lista de espera, en el puesto ${cliente.espera.puesto}.`
    : '';

  const hoy = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const puede: string[] = [];
  if (activa(funciones, 'reservar')) {
    puede.push('- Mirar huecos libres y reservar citas con la herramienta huecos y reservar.');
  }
  if (activa(funciones, 'mover')) {
    puede.push('- Mover una cita a otra hora con la herramienta mover.');
  }
  if (activa(funciones, 'cancelar')) {
    puede.push('- Cancelar una cita con la herramienta cancelar.');
  }
  if (activa(funciones, 'lista_espera')) {
    puede.push(
      '- Apuntar en la lista de espera cuando no haya hueco (apuntar_espera), consultar el puesto (mi_espera) y aceptar un hueco ofrecido (oferta).',
    );
  }
  if (activa(funciones, 'fidelidad')) {
    puede.push('- Decir cuántos sellos lleva con la herramienta fidelizacion. No canjea premios: eso se hace en el local.');
  }
  if (activa(funciones, 'recomendaciones')) {
    puede.push('- Sugerir qué le puede venir bien con la herramienta recomendaciones, sin insistir.');
  }
  if (!activa(funciones, 'mover')) puede.push('- No puedes cambiar citas de hora: si lo pide, pásalo al dueño.');
  if (!activa(funciones, 'cancelar')) puede.push('- No puedes cancelar citas: si lo pide, pásalo al dueño.');

  // El saludo que ha escrito el dueño se usa tal cual la primera vez.
  const bienvenida =
    cliente.primer && (local.bienvenida ?? '').trim()
      ? `Abre tu respuesta con este saludo, palabra por palabra: «${(local.bienvenida ?? '').trim()}». Después contesta a lo que te diga, sin repetir el saludo.`
      : '';

  const enlace = cliente.vinculado === false
    ? [
        'ESTE NÚMERO NO ESTÁ EN NINGUNA FICHA TODAVÍA.',
        '- Atiéndele con normalidad, pero no le atribuyas historial, sellos ni citas de otra persona.',
        '- Puedes reservarle igual: pregúntale cómo se llama y usa reservar con su nombre. Se crea su ficha con este mismo número.',
        '- Si dice que ya es cliente, ofrécele enlazar su ficha: usa pedir_codigo y dile que le acaba de llegar un código de 6 cifras.',
      ]
    : [];

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
    conPrecios ? '' : '(Los precios no los das por aquí: se dicen en el local.)',
    '',
    'HORARIOS:',
    horarios || '- (el local no ha cargado horarios)',
    '',
    'QUIEN TIENE DELANTE:',
    cliente.vinculado === false
      ? '- No sé su nombre todavía. Pregúntaselo si hace falta para la cita.'
      : `- Se llama ${cliente.nombre}.`,
    cliente.vinculado === false ? '' : `- ${proxima}`,
    cliente.vinculado === false ? '' : `- ${ultima}`,
    fidelidad && cliente.vinculado !== false ? `- ${fidelidad}` : '',
    espera,
    bienvenida,
    ...enlace,
    '',
    'CÓMO TRABAJAS:',
    `- ${TONOS[local.personalidad ?? 'cercano'] ?? TONOS.cercano}`,
    '- Frases cortas. Como mucho un emoji, y solo si encaja.',
    '- Saludas por su nombre si lo sabes y, si viene al caso, mencionas su cita o sus sellos.',
    ...puede,
    '- Para cualquier precio, servicio u hora usa SIEMPRE las herramientas: nunca los inventes.',
    '- Antes de reservar, repite servicio, día y hora y espera confirmación.',
    '- Haz como máximo dos preguntas seguidas. Si el cliente no quiere hablar, no insistas.',
    '- Si te pide algo que no puedes hacer, o no lo entiendes, usa pasar_al_barbero.',
    '- Nunca pides datos de salud ni los comentas. Nunca hablas de otros clientes ni de su historial de dinero.',
    '- No dices que eres una persona: eres el asistente virtual del local.',
    ...(canal === 'whatsapp' ? ['- Es WhatsApp: frases cortas. Nunca contestas con parrafadas.'] : []),
  ]
    .filter((linea) => linea !== '')
    .join('\n');
}

/** Lo que se contesta la primera vez, si el local no ha escrito el suyo. */
export function saludoPorDefecto(local: { nombre: string; asistente?: string | null }): string {
  const nombre = (local.asistente ?? '').trim();
  return nombre
    ? `¡Hola! Soy ${nombre}, el asistente de ${local.nombre}. ¿Te ayudo con una cita?`
    : `¡Hola! Soy el asistente de ${local.nombre}. ¿Te ayudo con una cita?`;
}
