// JULEX · recepción por WhatsApp
//
// Envoltorio tipado de la configuración del agente, el panel de actividad y
// las tres acciones del canal. Igual que el resto de la app: con Supabase se
// habla con las funciones reales; sin Supabase todo es una demostración que
// se anuncia como tal.

import { toast } from '../components/ui';
import { AVATARES } from './avatares';
import { haySupabase, supabase } from './supabase';

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type TonoRecepcion = 'cercano' | 'formal' | 'divertido';

export const CLAVES_FUNCIONES = [
  'reservar',
  'mover',
  'cancelar',
  'precios',
  'lista_espera',
  'recordatorios',
  'fidelidad',
  'recomendaciones',
  'derivar',
  'aprobacion',
] as const;

export type ClaveFuncion = (typeof CLAVES_FUNCIONES)[number];
export type FuncionesRecepcion = Record<ClaveFuncion, boolean>;

export interface ConfigRecepcion {
  nombre: string;
  tono: TonoRecepcion;
  personalidad: string;
  bienvenida: string;
  avatarId: string;
  funciones: FuncionesRecepcion;
  activo: boolean;
  canalWhatsapp: boolean;
}

export type EstadoLineaRecepcion = 'pendiente' | 'activa' | 'pausa';
export type ModoLineaRecepcion = 'prueba' | 'real';

export interface LineaRecepcion {
  telefono: string;
  estado: EstadoLineaRecepcion;
  modo: ModoLineaRecepcion;
  /** Números que pueden hablar en modo prueba, además del dueño. */
  autorizados?: string[];
}

export interface MetricasRecepcion {
  conversaciones: number;
  citas: number;
  fueraHorario: number;
  derivadas: number;
  recordatorios: number;
  espera: number;
  premios: number;
}

export interface PendienteRecepcion {
  id: string;
  tipo: 'cita' | 'ficha';
  texto: string;
  creadoEn: string;
}

export interface EsperaRecepcion {
  id: string;
  nombre: string;
  servicio: string;
  desde: string;
}

export interface TopesRecepcion {
  conversaciones: number;
  usadas: number;
  mensajes: number;
  usados: number;
}

export interface PanelRecepcion {
  linea: LineaRecepcion | null;
  metricas: MetricasRecepcion;
  pendientes: PendienteRecepcion[];
  espera: EsperaRecepcion[];
  topes: TopesRecepcion;
}

export interface ResultadoConexion {
  estado: 'conectado' | 'pendiente' | 'error';
  mensaje?: string;
  /** Dirección de Meta cuando toca terminar el alta fuera de la app. */
  url?: string;
}

export interface DatosAltaWhatsApp {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

export interface SimulacionRecepcion {
  respuesta: string;
  herramientas: string[];
}

/* ------------------------------------------------------------------ */
/* Catálogo de opciones                                                */
/* ------------------------------------------------------------------ */

export interface PersonalidadRecepcion {
  id: string;
  nombre: string;
  tono: TonoRecepcion;
  ejemplo: string;
}

/**
 * Cuatro formas de hablar. `personalidad` es lo que se guarda y admite
 * cuatro valores; `tono` solo agrupa la frase para el resto de la app.
 */
export const PERSONALIDADES: PersonalidadRecepcion[] = [
  {
    id: 'cercano',
    nombre: 'Cercano',
    tono: 'cercano',
    ejemplo: '«¡Hola, Marta! ¿Te guardo el hueco de siempre?»',
  },
  {
    id: 'formal',
    nombre: 'Formal',
    tono: 'formal',
    ejemplo: '«Buenos días, Marta. ¿Desea reservar su próxima cita?»',
  },
  {
    id: 'divertido',
    nombre: 'Divertido',
    tono: 'divertido',
    ejemplo: '«¡Marta! Hacía mucho que no te veíamos. ¿Reservamos?»',
  },
  {
    // El identificador tiene que ser el que acepta la base de datos:
    // `asistente_config.personalidad` solo admite cuatro valores.
    id: 'elegante',
    nombre: 'Elegante',
    tono: 'cercano',
    ejemplo: '«Hola, Marta. Cuando quieras, te busco un hueco tranquilo.»',
  },
];

export const FUNCIONES_RECEPCION: {
  clave: ClaveFuncion;
  nombre: string;
  descripcion: string;
}[] = [
  { clave: 'reservar', nombre: 'Reservar', descripcion: 'Pedir cita para un día y una hora.' },
  { clave: 'mover', nombre: 'Mover', descripcion: 'Cambiar una cita por otra sin llamarte.' },
  { clave: 'cancelar', nombre: 'Cancelar', descripcion: 'Anular una cita y dejar el hueco libre.' },
  { clave: 'precios', nombre: 'Precios', descripcion: 'Decir cuánto cuesta cada servicio.' },
  {
    clave: 'lista_espera',
    nombre: 'Lista de espera',
    descripcion: 'Apuntar a quien quiere entrar antes.',
  },
  {
    clave: 'recordatorios',
    nombre: 'Recordatorios',
    descripcion: 'Avisar de la cita un día antes.',
  },
  { clave: 'fidelidad', nombre: 'Fidelidad', descripcion: 'Contar sellos y premios.' },
  {
    clave: 'recomendaciones',
    nombre: 'Recomendaciones',
    descripcion: 'Sugerir el siguiente servicio con criterio.',
  },
  {
    clave: 'derivar',
    nombre: 'Pasar a ti',
    descripcion: 'Avisarte cuando no sabe o hace falta una persona.',
  },
  {
    clave: 'aprobacion',
    nombre: 'Confirmar yo las citas',
    descripcion:
      'La cita ocupa su hueco igual, pero Nico te la manda al WhatsApp con dos botones para que la confirmes tú. Va bien las dos primeras semanas.',
  },
];

const FUNCIONES_POR_DEFECTO: FuncionesRecepcion = {
  reservar: true,
  mover: true,
  cancelar: true,
  precios: true,
  lista_espera: true,
  recordatorios: true,
  fidelidad: true,
  recomendaciones: true,
  derivar: true,
  aprobacion: false,
};

export const CONFIG_POR_DEFECTO: ConfigRecepcion = {
  nombre: 'Julia',
  tono: 'cercano',
  personalidad: 'cercano',
  bienvenida: 'Hola, soy tu recepcionista. ¿Te ayudo con tu próxima cita?',
  avatarId: 'julia',
  funciones: { ...FUNCIONES_POR_DEFECTO },
  activo: true,
  canalWhatsapp: false,
};

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */

function texto(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

function numero(v: unknown, porDefecto = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : porDefecto;
}

function objeto(v: unknown): Record<string, unknown> {
  if (typeof v === 'string') {
    try {
      const parseado: unknown = JSON.parse(v);
      return objeto(parseado);
    } catch {
      return {};
    }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function clonarConfig(config: ConfigRecepcion): ConfigRecepcion {
  return { ...config, funciones: { ...config.funciones } };
}

function normalizarFunciones(v: unknown): FuncionesRecepcion {
  const crudas = objeto(v);
  const salida = { ...FUNCIONES_POR_DEFECTO };
  for (const clave of CLAVES_FUNCIONES) {
    if (typeof crudas[clave] === 'boolean') salida[clave] = crudas[clave] as boolean;
  }
  return salida;
}

function personalidadDesdeTono(v: unknown): string {
  return v === 'formal' || v === 'divertido' ? v : 'cercano';
}

function tonoDePersonalidad(id: string): TonoRecepcion {
  return PERSONALIDADES.find((p) => p.id === id)?.tono ?? 'cercano';
}

function configDesdeFila(fila: Record<string, unknown> | null): ConfigRecepcion {
  if (!fila) return clonarConfig(CONFIG_POR_DEFECTO);

  const cruda = texto(fila.personalidad);
  const personalidad = PERSONALIDADES.some((p) => p.id === cruda)
    ? cruda
    : personalidadDesdeTono(fila.tono);
  const avatar = texto(fila.avatar_id);

  return {
    nombre: texto(fila.nombre).slice(0, 40),
    tono: tonoDePersonalidad(personalidad),
    personalidad,
    bienvenida: texto(fila.bienvenida).slice(0, 160),
    avatarId: AVATARES.some((a) => a.id === avatar) ? avatar : 'julia',
    funciones: normalizarFunciones(fila.funciones),
    activo: fila.activo == null ? true : Boolean(fila.activo),
    canalWhatsapp: Boolean(fila.canal_whatsapp),
  };
}

function normalizarLinea(v: unknown): LineaRecepcion | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const estado: EstadoLineaRecepcion =
    o.estado === 'activa' || o.estado === 'pausa' ? o.estado : 'pendiente';
  return {
    telefono: texto(o.telefono),
    estado,
    modo: o.modo === 'real' ? 'real' : 'prueba',
    autorizados: Array.isArray(o.autorizados)
      ? (o.autorizados as unknown[]).map((x) => texto(x)).filter(Boolean)
      : [],
  };
}

function normalizarPendientes(v: unknown): PendienteRecepcion[] {
  if (!Array.isArray(v)) return [];
  const salida: PendienteRecepcion[] = [];
  for (const item of v) {
    const o = objeto(item);
    const tipo = o.tipo === 'cita' || o.tipo === 'ficha' ? o.tipo : null;
    const id = texto(o.id);
    if (!tipo || !id) continue;
    salida.push({
      id,
      tipo,
      texto: texto(o.texto),
      creadoEn: texto(o.creado_en),
    });
  }
  return salida;
}

function normalizarEspera(v: unknown): EsperaRecepcion[] {
  if (!Array.isArray(v)) return [];
  const salida: EsperaRecepcion[] = [];
  for (const item of v) {
    const o = objeto(item);
    const id = texto(o.id);
    if (!id) continue;
    salida.push({
      id,
      nombre: texto(o.nombre),
      servicio: texto(o.servicio),
      desde: texto(o.desde),
    });
  }
  return salida;
}

function normalizarPanel(v: unknown): PanelRecepcion {
  const o = objeto(v);
  const m = objeto(o.metricas);
  const t = objeto(o.topes);

  return {
    linea: normalizarLinea(o.linea),
    metricas: {
      conversaciones: numero(m.conversaciones),
      citas: numero(m.citas),
      fueraHorario: numero(m.fuera_horario),
      derivadas: numero(m.derivadas),
      recordatorios: numero(m.recordatorios),
      espera: numero(m.espera),
      premios: numero(m.premios),
    },
    pendientes: normalizarPendientes(o.pendientes),
    espera: normalizarEspera(o.espera),
    topes: {
      conversaciones: numero(t.conversaciones, 300),
      usadas: numero(t.usadas),
      mensajes: numero(t.mensajes, 1500),
      usados: numero(t.usados),
    },
  };
}

function soloDigitos(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '').slice(-9);
}

/* ------------------------------------------------------------------ */
/* Lectura y guardado                                                  */
/* ------------------------------------------------------------------ */

export async function cargarConfig(barberiaId: string): Promise<ConfigRecepcion> {
  if (!haySupabase || !supabase) return clonarConfig(CONFIG_POR_DEFECTO);

  // `select('*')` tolera que la migración todavía no tenga todas las
  // columnas: lo que falte cae en los valores por defecto.
  const { data, error } = await supabase
    .from('asistente_config')
    .select('*')
    .eq('barberia_id', barberiaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return configDesdeFila((data ?? null) as Record<string, unknown> | null);
}

export async function guardarConfig(
  barberiaId: string,
  config: ConfigRecepcion,
): Promise<boolean> {
  if (!haySupabase || !supabase) {
    toast('Esto es una demostración: los cambios no se guardan.', 'info');
    return false;
  }

  const personalidad = PERSONALIDADES.find((p) => p.id === config.personalidad) ?? PERSONALIDADES[0];

  const { error } = await supabase.from('asistente_config').upsert(
    {
      barberia_id: barberiaId,
      nombre: config.nombre.trim().slice(0, 40),
      // `tono` se llamaba así antes de la migración 0031; hoy el tono es
      // `personalidad` y no se escriben las dos para que no discrepen.
      personalidad: personalidad.id,
      bienvenida: config.bienvenida.trim().slice(0, 160),
      avatar_id: config.avatarId,
      funciones: normalizarFunciones(config.funciones),
      activo: config.activo,
      canal_whatsapp: config.canalWhatsapp,
    },
    { onConflict: 'barberia_id' },
  );

  if (error) throw new Error(error.message);
  return true;
}

export async function cargarPanel(barberiaId: string): Promise<PanelRecepcion> {
  if (!haySupabase || !supabase) return panelDemo();

  const { data, error } = await supabase.rpc('recepcion_panel', { p_barberia: barberiaId });
  if (error) throw new Error(error.message);
  return normalizarPanel(data);
}

/* ------------------------------------------------------------------ */
/* Conversación de prueba                                              */
/* ------------------------------------------------------------------ */

let avisadoSimular = false;

export async function simular(
  mensaje: string,
  historial: { papel: 'cliente' | 'agente'; texto: string }[] = [],
): Promise<SimulacionRecepcion> {
  const limpio = mensaje.trim();
  if (!limpio) return { respuesta: '', herramientas: [] };

  if (!haySupabase || !supabase) {
    if (!avisadoSimular) {
      avisadoSimular = true;
      toast('Modo demostración: las respuestas son de ejemplo.', 'info');
    }
    return respuestaDemo(limpio);
  }

  const { data, error } = await supabase.functions.invoke('wa-simular', {
    body: {
      mensaje: limpio,
      // Sin historial, el agente saludaría de cero en cada frase y la
      // prueba no se parecería a una conversación de verdad.
      historial: historial.slice(-10).map((b) => ({
        papel: b.papel === 'cliente' ? 'cliente' : 'asistente',
        texto: b.texto.slice(0, 800),
      })),
    },
  });
  if (error) throw new Error(error.message);

  const r = objeto(data);
  const respuesta = texto(r.respuesta).trim();
  const herramientas = Array.isArray(r.herramientas)
    ? r.herramientas.map((x) => texto(x)).filter(Boolean)
    : [];

  return {
    respuesta: respuesta || 'No sé qué contestar a eso. Prueba con otra frase.',
    herramientas,
  };
}

function respuestaDemo(mensaje: string): SimulacionRecepcion {
  const t = mensaje.toLowerCase();

  if (/cita|reserv|hueco|jueves|viernes|lunes|martes|miércoles|sábado/.test(t)) {
    return {
      respuesta:
        'En la demostración no puedo tocar la agenda, pero te enseño cómo lo diría: «Tengo hueco el jueves a las 17:30. ¿Te va bien?».',
      herramientas: ['reservar'],
    };
  }

  if (/precio|cuánto|cuanto|€|euro|tarifa/.test(t)) {
    return {
      respuesta:
        'Los precios salen de tu carta, no me los invento. En la demostración no hay carta que mirar.',
      herramientas: ['precios'],
    };
  }

  if (/hola|buenas|qué tal|que tal/.test(t)) {
    return {
      respuesta:
        'Hola. Soy tu recepcionista. En la demostración solo puedo saludar; con el local conectado miro la agenda de verdad.',
      herramientas: [],
    };
  }

  return {
    respuesta:
      'Estoy en modo demostración. Con el canal conectado contesto con la agenda, los precios y las reglas de tu local.',
    herramientas: [],
  };
}

/* ------------------------------------------------------------------ */
/* Canal de WhatsApp                                                   */
/* ------------------------------------------------------------------ */

export async function conectar(): Promise<ResultadoConexion> {
  if (!haySupabase || !supabase) {
    lineaDemo = { telefono: '600 123 456', estado: 'pendiente', modo: 'prueba' };
    toast('Esto es una demostración: así se vería el número en modo prueba.', 'info');
    return {
      estado: 'pendiente',
      mensaje: 'Modo prueba: escribe «Hola» desde el móvil del local para abrirlo.',
    };
  }

  try {
    // Primero se pregunta el estado, como pide el contrato. Si aún no hay
    // línea, se pide la dirección de Meta: la función la devuelve con
    // `accion: 'url'`, que es lo que abre el alta.
    const consulta = await supabase.functions.invoke('wa-onboarding', { body: {} });
    if (consulta.error) return { estado: 'error', mensaje: consulta.error.message };

    const primero = objeto(consulta.data);
    if (primero.estado === 'conectado') {
      return { estado: 'conectado', mensaje: texto(primero.mensaje) || undefined };
    }

    if (typeof primero.url === 'string' && primero.url) {
      return {
        estado: 'pendiente',
        mensaje: typeof primero.mensaje === 'string' ? primero.mensaje : undefined,
        url: primero.url,
      };
    }

    const arranque = await supabase.functions.invoke('wa-onboarding', {
      body: { accion: 'url' },
    });
    if (arranque.error) return { estado: 'error', mensaje: arranque.error.message };

    const r = objeto(arranque.data);
    const estado =
      r.estado === 'conectado' || r.estado === 'pendiente' || r.estado === 'error'
        ? r.estado
        : 'error';
    return {
      estado,
      mensaje: typeof r.mensaje === 'string' ? r.mensaje : undefined,
      url: typeof r.url === 'string' && r.url ? r.url : undefined,
    };
  } catch (e) {
    return {
      estado: 'error',
      mensaje: e instanceof Error ? e.message : 'No se pudo abrir la conexión con Meta.',
    };
  }
}

/**
 * Meta vuelve a `/panel/recepcion` con el código y los identificadores.
 * Se canjean una sola vez para dejar la línea guardada.
 */
export async function completarConexion(datos: DatosAltaWhatsApp): Promise<ResultadoConexion> {
  if (!haySupabase || !supabase) {
    toast('Esto es una demostración: Meta no devuelve ningún número.', 'info');
    return { estado: 'error', mensaje: 'Demostración: no hay conexión que completar.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('wa-onboarding', {
      body: {
        accion: 'guardar',
        code: datos.code,
        waba_id: datos.wabaId,
        phone_number_id: datos.phoneNumberId,
      },
    });
    if (error) return { estado: 'error', mensaje: error.message };

    const r = objeto(data);
    const estado =
      r.estado === 'conectado' || r.estado === 'pendiente' || r.estado === 'error'
        ? r.estado
        : 'error';
    return {
      estado,
      mensaje: typeof r.mensaje === 'string' ? r.mensaje : undefined,
    };
  } catch (e) {
    return {
      estado: 'error',
      mensaje: e instanceof Error ? e.message : 'No se pudo terminar la conexión.',
    };
  }
}

/**
 * Los números que pueden hablar con la línea en modo prueba, además del
 * dueño. Sin esto, enseñar el invento obliga a tocar SQL.
 */
export async function autorizarNumero(
  barberiaId: string,
  telefono: string,
  autorizar: boolean,
): Promise<boolean> {
  const limpio = soloDigitos(telefono);
  if (limpio.length !== 9) throw new Error('El número tiene que tener 9 cifras.');

  if (!haySupabase || !supabase) {
    if (lineaDemo) {
      const actuales = new Set(lineaDemo.autorizados ?? []);
      if (autorizar) actuales.add(limpio);
      else actuales.delete(limpio);
      lineaDemo = { ...lineaDemo, autorizados: [...actuales] };
    }
    toast('Esto es una demostración: el cambio se ve solo en pantalla.', 'info');
    return true;
  }

  const { data, error } = await supabase
    .from('wa_linea')
    .select('autorizados')
    .eq('barberia_id', barberiaId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const actuales = new Set<string>((data?.autorizados ?? []) as string[]);
  if (autorizar) actuales.add(limpio);
  else actuales.delete(limpio);

  const { error: errorGuardar } = await supabase
    .from('wa_linea')
    .update({ autorizados: [...actuales] })
    .eq('barberia_id', barberiaId);
  if (errorGuardar) throw new Error(errorGuardar.message);
  return true;
}

export async function desconectar(barberiaId: string): Promise<boolean> {
  if (!haySupabase || !supabase) {
    lineaDemo = null;
    toast('Esto es una demostración: el canal se apaga solo en pantalla.', 'info');
    return true;
  }

  const { error } = await supabase.rpc('wa_desconectar', { p_barberia: barberiaId });
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Modo prueba ↔ modo real. En prueba solo contestan el dueño y los
 * números autorizados; en real, todos los clientes. Es el único paso
 * que separa «lo estoy viendo» de «está trabajando para mí», así que se
 * pide confirmación desde la pantalla.
 */
export async function cambiarModo(
  barberiaId: string,
  modo: ModoLineaRecepcion,
): Promise<boolean> {
  if (!haySupabase || !supabase) {
    if (lineaDemo) lineaDemo = { ...lineaDemo, modo };
    toast('Esto es una demostración: el cambio se ve solo en pantalla.', 'info');
    return true;
  }

  const { error } = await supabase
    .from('wa_linea')
    .update({ modo })
    .eq('barberia_id', barberiaId);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Aprobar o descartar un pendiente. La RPC confirma la cita o la cancela
 * y deja el hueco libre; no hay que tocar la cita a mano.
 */
export async function resolverPendiente(
  pendiente: PendienteRecepcion,
  accion: 'aprobar' | 'descartar',
): Promise<boolean> {
  if (!haySupabase || !supabase) {
    resueltosDemo.add(pendiente.id);
    toast('Esto es una demostración: la decisión solo cambia en pantalla.', 'info');
    return true;
  }

  const { data, error } = await supabase.rpc('recepcion_aprobar', {
    p_id: pendiente.id,
    p_aprobar: accion === 'aprobar',
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/* ------------------------------------------------------------------ */
/* Demostración                                                        */
/* ------------------------------------------------------------------ */

const METRICAS_DEMO: MetricasRecepcion = {
  conversaciones: 34,
  citas: 11,
  fueraHorario: 7,
  derivadas: 3,
  recordatorios: 9,
  espera: 2,
  premios: 4,
};

const PENDIENTES_DEMO: PendienteRecepcion[] = [
  {
    id: 'demo-cita-1',
    tipo: 'cita',
    texto: 'Marta quiere cita el jueves a las 17:30. No le viene bien el viernes.',
    creadoEn: new Date(Date.now() - 42 * 60_000).toISOString(),
  },
  {
    id: 'demo-ficha-1',
    tipo: 'ficha',
    texto: 'Pablo prefiere degradado suave y no hablar de fútbol mientras le atiendes.',
    creadoEn: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  },
];

const ESPERA_DEMO: EsperaRecepcion[] = [
  {
    id: 'demo-espera-1',
    nombre: 'Lucía',
    servicio: 'Corte y peinado',
    desde: new Date(Date.now() - 12 * 60_000).toISOString(),
  },
  {
    id: 'demo-espera-2',
    nombre: 'Andrés',
    servicio: 'Barba',
    desde: new Date(Date.now() - 26 * 60_000).toISOString(),
  },
];

const TOPES_DEMO: TopesRecepcion = {
  conversaciones: 300,
  usadas: 34,
  mensajes: 1500,
  usados: 212,
};

/** En la demo, conectar y desconectar cambian esta línea para poder verlo. */
let lineaDemo: LineaRecepcion | null = {
  telefono: '600 123 456',
  estado: 'activa',
  modo: 'prueba',
  autorizados: [],
};

const resueltosDemo = new Set<string>();

function panelDemo(): PanelRecepcion {
  return {
    linea: lineaDemo ? { ...lineaDemo } : null,
    metricas: { ...METRICAS_DEMO },
    pendientes: PENDIENTES_DEMO.filter((p) => !resueltosDemo.has(p.id)).map((p) => ({ ...p })),
    espera: ESPERA_DEMO.map((e) => ({ ...e })),
    topes: { ...TOPES_DEMO },
  };
}
