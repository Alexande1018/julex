// JULEX · herramientas del recepcionista
//
// El modelo no toca la base de datos: pide estas operaciones y el
// servidor las valida y las ejecuta contra las RPC que ya existen.
//
// Dos reglas que no se rompen:
//  1. Si una función está apagada en los ajustes del local, la
//     herramienta ni siquiera se le ofrece al modelo.
//  2. En modo prueba (simulado) las herramientas de escritura no
//     escriben: devuelven una respuesta creíble para que el dueño vea
//     cómo hablaría su recepcionista sin tocar su agenda.

import type { Herramienta, HerramientaDef, Json } from './engine.ts';

/* ------------------------------------------------------------------ */
/* Esquemas                                                           */
/* ------------------------------------------------------------------ */

const ESQUEMA_HUECOS: Json = {
  type: 'object',
  properties: {
    servicio: { type: 'string', maxLength: 60 },
    desde: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    dias: { type: 'integer', minimum: 1, maximum: 14 },
  },
  required: ['servicio', 'desde'],
  additionalProperties: false,
};

const ESQUEMA_RESERVAR: Json = {
  type: 'object',
  properties: {
    servicio: { type: 'string', maxLength: 60 },
    inicio: { type: 'string', maxLength: 40 },
    confirmado: { type: 'boolean' },
    // Solo hace falta cuando escribe alguien que aún no tiene ficha: es
    // el nombre con el que se crea. Con ficha, sobra.
    nombre: { type: 'string', maxLength: 60 },
  },
  required: ['servicio', 'inicio', 'confirmado'],
  additionalProperties: false,
};

const ESQUEMA_CANCELAR: Json = {
  type: 'object',
  properties: {
    inicio: { type: 'string', maxLength: 40 },
  },
  required: ['inicio'],
  additionalProperties: false,
};

const ESQUEMA_MOVER: Json = {
  type: 'object',
  properties: {
    inicio_actual: { type: 'string', maxLength: 40 },
    inicio_nuevo: { type: 'string', maxLength: 40 },
  },
  required: ['inicio_actual', 'inicio_nuevo'],
  additionalProperties: false,
};

const ESQUEMA_FICHA: Json = {
  type: 'object',
  properties: {
    como_corta: { type: 'string', maxLength: 600 },
    preferencias: { type: 'string', maxLength: 400 },
    texto_original: { type: 'string', maxLength: 1200 },
  },
  required: ['como_corta'],
  additionalProperties: false,
};

const ESQUEMA_DERIVAR: Json = {
  type: 'object',
  properties: {
    motivo: { type: 'string', maxLength: 300 },
  },
  required: ['motivo'],
  additionalProperties: false,
};

const ESQUEMA_APUNTAR_ESPERA: Json = {
  type: 'object',
  properties: {
    servicio: { type: 'string', maxLength: 60 },
    desde: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    hasta: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    preferencia: { type: 'string', enum: ['manana', 'tarde', 'cualquiera'] },
  },
  required: [],
  additionalProperties: false,
};

const ESQUEMA_OFERTA: Json = {
  type: 'object',
  properties: {
    aceptar: { type: 'boolean' },
  },
  required: ['aceptar'],
  additionalProperties: false,
};

const ESQUEMA_VACIO: Json = { type: 'object', properties: {}, additionalProperties: false };

export const ESQUEMAS = {
  huecos: ESQUEMA_HUECOS,
  reservar: ESQUEMA_RESERVAR,
  cancelar: ESQUEMA_CANCELAR,
  mover: ESQUEMA_MOVER,
  proponer_ficha: ESQUEMA_FICHA,
  pasar_al_barbero: ESQUEMA_DERIVAR,
  apuntar_espera: ESQUEMA_APUNTAR_ESPERA,
  mi_espera: ESQUEMA_VACIO,
  oferta: ESQUEMA_OFERTA,
  fidelizacion: ESQUEMA_VACIO,
  recomendaciones: ESQUEMA_VACIO,
  pedir_codigo: ESQUEMA_VACIO,
};

/* ------------------------------------------------------------------ */
/* Contexto                                                           */
/* ------------------------------------------------------------------ */

export interface ServicioLocal {
  id: string;
  nombre: string;
  minutos: number;
  precio?: number;
}

export interface Oferta {
  id: string;
  inicio: string;
  servicio: string | null;
}

export interface Espera {
  espera_id: string;
  puesto: number;
  estado: string;
  oferta: Oferta | null;
}

export interface RespuestaRpc {
  data: unknown;
  error: { message: string } | null;
}

/** Las diez llaves de `asistente_config.funciones`. */
export type Funciones = Record<string, boolean | undefined>;

export interface Contexto {
  token: string;
  pin: string | null;
  slug: string;
  barberiaId: string;
  /** Los 9 dígitos del cliente. Vacío en el llavero. */
  telefono: string;
  clienteId: string | null;
  funciones: Funciones;
  /** Modo prueba: nada de esto escribe en la agenda. */
  simulado?: boolean;
  /** Lo que hay en la lista de espera para este teléfono, si hay algo. */
  espera?: Espera | null;
  servicios: ServicioLocal[];
  rpc: (funcion: string, argumentos: Json) => Promise<RespuestaRpc>;
}

/** Para comparar nombres sin acentos ni mayúsculas: "Corte + Barba" = "corte + barba". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function activa(contexto: Contexto, clave: string): boolean {
  return contexto.funciones?.[clave] !== false;
}

/**
 * Escritura con freno. En modo prueba devuelve una respuesta creíble y
 * dice que es una prueba; en modo real, llama a la RPC.
 */
async function escribir(
  contexto: Contexto,
  funcion: string,
  argumentos: Json,
): Promise<RespuestaRpc> {
  if (contexto.simulado) {
    return { data: { simulado: true }, error: null };
  }
  return contexto.rpc(funcion, argumentos);
}

function buscarServicio(contexto: Contexto, nombre: string): ServicioLocal {
  const buscado = normalizar(nombre);
  const exacto = contexto.servicios.find((s) => normalizar(s.nombre) === buscado);
  if (exacto) return exacto;

  const parciales = contexto.servicios.filter((s) => normalizar(s.nombre).includes(buscado));
  if (parciales.length === 1) return parciales[0];

  const nombres = contexto.servicios.map((s) => s.nombre).join(', ');
  throw new Error(`servicio_desconocido: ${nombres}`);
}

function buscarServicioSuave(contexto: Contexto, nombre: string): ServicioLocal | null {
  try {
    return buscarServicio(contexto, nombre);
  } catch {
    return null;
  }
}

/** El día (en Madrid) de un instante ISO. */
export function diaEnMadrid(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) throw new Error('fecha_invalida');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

function sumarDias(dia: string, dias: number): string {
  const base = new Date(`${dia}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

async function horasDelDia(
  contexto: Contexto,
  servicio: ServicioLocal,
  dia: string,
): Promise<string[]> {
  const { data, error } = await contexto.rpc('huecos_asistente', {
    p_slug: contexto.slug,
    p_dia: dia,
    p_minutos: servicio.minutos,
    p_paso: 30,
  });
  if (error) throw new Error(`huecos: ${error.message}`);
  return Array.isArray(data) ? (data as string[]) : [];
}

function mismoInstante(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/* ------------------------------------------------------------------ */
/* Herramientas                                                       */
/* ------------------------------------------------------------------ */

export function crearHerramientas(contexto: Contexto): Herramienta[] {
  const todas: (Herramienta & { requiere?: string })[] = [
    {
      nombre: 'huecos',
      requiere: 'reservar',
      descripcion:
        'Devuelve las horas libres reales de un servicio a partir de un día. Úsala siempre antes de proponer una hora.',
      parametros: ESQUEMA_HUECOS,
      async ejecutar(argumentos) {
        const servicio = buscarServicio(contexto, String(argumentos.servicio));
        const desde = String(argumentos.desde);
        const dias = Math.min(Number(argumentos.dias ?? 7) || 7, 14);

        const porDia: { dia: string; horas: string[] }[] = [];
        let total = 0;
        for (let i = 0; i < dias && total < 24; i++) {
          const dia = sumarDias(desde, i);
          const horas = await horasDelDia(contexto, servicio, dia);
          if (horas.length > 0) {
            // Tope de 24 horas: más solo llena el contexto y encarece el turno.
            const recortadas = horas.slice(0, 24 - total);
            porDia.push({ dia, horas: recortadas });
            total += recortadas.length;
          }
        }
        if (total === 0) return { servicio: servicio.nombre, horas: [], nota: 'sin_huecos' };
        return { servicio: servicio.nombre, por_dia: porDia };
      },
    },

    {
      nombre: 'reservar',
      requiere: 'reservar',
      descripcion:
        'Reserva una cita. Solo debe llamarse cuando el cliente ha confirmado el servicio, el día y la hora.',
      parametros: ESQUEMA_RESERVAR,
      async ejecutar(argumentos) {
        if (argumentos.confirmado !== true) {
          return { error: 'sin_confirmacion', nota: 'Repite la cita y espera un sí antes de reservar.' };
        }

        const servicio = buscarServicio(contexto, String(argumentos.servicio));
        const inicio = String(argumentos.inicio);
        const dia = diaEnMadrid(inicio);

        const libres = await horasDelDia(contexto, servicio, dia);
        if (!libres.some((hora) => mismoInstante(hora, inicio))) {
          return { error: 'hueco_no_disponible', nota: 'Comprueba otra vez con la herramienta huecos.' };
        }

        if (contexto.simulado) {
          return {
            reservada: true,
            simulado: true,
            servicio: servicio.nombre,
            inicio,
            nota: 'Es una prueba: no se ha apuntado nada en la agenda.',
          };
        }

        // Sin ficha no hay token: la cita crea la ficha, y para eso hace
        // falta el nombre. El teléfono lo pone el canal, no el cliente.
        const sinFicha = !contexto.token;
        const nombre = String(argumentos.nombre ?? '').trim();
        if (sinFicha && nombre.length < 2) {
          return {
            error: 'falta_nombre',
            nota: 'Pregúntale cómo se llama antes de reservar.',
          };
        }

        const { data, error } = await contexto.rpc('solicitar_cita', {
          p_slug: contexto.slug,
          p_servicio: servicio.id,
          p_inicio: inicio,
          p_nombre: sinFicha ? nombre : '',
          p_telefono: sinFicha ? contexto.telefono : '',
          p_token: contexto.token || null,
          p_origen: 'asistente',
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };

        // Modo estreno: la cita ya ocupa su hueco —no hay dobles— pero el
        // dueño decide si se confirma. El aviso lo manda el canal, que es
        // quien tiene permiso para escribir en la tabla de aprobaciones.
        if (activa(contexto, 'aprobacion')) {
          return {
            reservada: true,
            pendiente_de_confirmar: true,
            cita: data,
            servicio: servicio.nombre,
            inicio,
            nota: 'Dile que se la confirmas en un momento, sin dar la hora por cerrada.',
          };
        }

        return { reservada: true, cita: data, servicio: servicio.nombre, inicio };
      },
    },

    {
      nombre: 'cancelar',
      requiere: 'cancelar',
      descripcion: 'Cancela la cita del cliente que empieza en ese instante.',
      parametros: ESQUEMA_CANCELAR,
      async ejecutar(argumentos) {
        const inicio = String(argumentos.inicio);

        // En modo prueba no hay citas que cancelar: se contesta como si
        // las hubiera, para que el dueño vea el flujo entero.
        if (contexto.simulado) return { cancelada: true, inicio, simulado: true };

        const { data, error } = await contexto.rpc('mis_citas', {
          p_token: contexto.token,
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };

        const citas = (data as { citas?: { id: string; inicio: string }[] } | null)?.citas ?? [];
        const cita = citas.find((c) => mismoInstante(c.inicio, inicio));
        if (!cita) return { error: 'cita_no_encontrada' };

        const cancelacion = await escribir(contexto, 'cancelar_cita', {
          p_token: contexto.token,
          p_cita: cita.id,
          p_pin: contexto.pin,
        });
        if (cancelacion.error) return { error: cancelacion.error.message };
        if (cancelacion.data !== true && !contexto.simulado) {
          return { error: 'no_se_puede_cancelar' };
        }

        return { cancelada: true, inicio, simulado: contexto.simulado === true };
      },
    },

    {
      nombre: 'mover',
      requiere: 'mover',
      descripcion: 'Mueve la cita del cliente a otro instante, si el hueco está libre.',
      parametros: ESQUEMA_MOVER,
      async ejecutar(argumentos) {
        const actual = String(argumentos.inicio_actual);
        const nuevo = String(argumentos.inicio_nuevo);

        if (contexto.simulado) return { movida: true, inicio: nuevo, simulado: true };

        const { data, error } = await contexto.rpc('mis_citas', {
          p_token: contexto.token,
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };

        const citas =
          (data as {
            citas?: { id: string; inicio: string; servicio_id: string; servicio: string; minutos: number }[];
          } | null)?.citas ?? [];
        const cita = citas.find((c) => mismoInstante(c.inicio, actual));
        if (!cita) return { error: 'cita_no_encontrada' };

        const servicio =
          contexto.servicios.find((s) => s.id === cita.servicio_id) ??
          contexto.servicios.find((s) => normalizar(s.nombre) === normalizar(cita.servicio));
        if (!servicio) return { error: 'servicio_no_encontrado' };

        const libres = await horasDelDia(contexto, servicio, diaEnMadrid(nuevo));
        if (!libres.some((hora) => mismoInstante(hora, nuevo))) {
          return { error: 'hueco_no_disponible' };
        }

        const movimiento = await escribir(contexto, 'mover_cita', {
          p_token: contexto.token,
          p_cita: cita.id,
          p_inicio: nuevo,
          p_pin: contexto.pin,
        });
        if (movimiento.error) return { error: movimiento.error.message };

        return { movida: true, inicio: nuevo, simulado: contexto.simulado === true };
      },
    },

    {
      nombre: 'proponer_ficha',
      descripcion:
        'Guarda lo que el cliente ha contado sobre cómo quiere el corte o sus preferencias. El barbero lo revisa.',
      parametros: ESQUEMA_FICHA,
      async ejecutar(argumentos) {
        if (!contexto.token) return { error: 'sin_ficha' };
        const { data, error } = await escribir(contexto, 'proponer_ficha', {
          p_token: contexto.token,
          p_como_corta: String(argumentos.como_corta ?? ''),
          p_preferencias: String(argumentos.preferencias ?? ''),
          p_texto_original: String(argumentos.texto_original ?? ''),
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };
        return { guardada: true, propuesta: data, simulado: contexto.simulado === true };
      },
    },

    {
      nombre: 'pasar_al_barbero',
      requiere: 'derivar',
      descripcion:
        'Avisa al dueño de que el cliente necesita una persona. Úsala si no entiendes, si pide algo raro o si se queja.',
      parametros: ESQUEMA_DERIVAR,
      async ejecutar(argumentos) {
        return { derivado: true, motivo: String(argumentos.motivo ?? '') };
      },
    },

    /* ---------------- lista de espera ---------------- */

    {
      nombre: 'apuntar_espera',
      requiere: 'lista_espera',
      descripcion:
        'Apunta al cliente en la lista de espera cuando no hay hueco que le venga bien. Dile que le avisas si se libera algo.',
      parametros: ESQUEMA_APUNTAR_ESPERA,
      async ejecutar(argumentos) {
        if (!contexto.telefono) return { error: 'sin_telefono' };

        const servicio =
          typeof argumentos.servicio === 'string' && argumentos.servicio
            ? buscarServicioSuave(contexto, argumentos.servicio)
            : null;

        const { data, error } = await escribir(contexto, 'wa_espera_apuntar', {
          p_barberia: contexto.barberiaId,
          p_telefono: contexto.telefono,
          p_nombre: '',
          p_servicio: servicio?.id ?? null,
          p_desde: typeof argumentos.desde === 'string' ? argumentos.desde : diaEnMadrid(new Date().toISOString()),
          p_hasta: typeof argumentos.hasta === 'string' ? argumentos.hasta : null,
          p_preferencia:
            typeof argumentos.preferencia === 'string' ? argumentos.preferencia : 'cualquiera',
        });
        if (error) return { error: error.message };

        const puesto = (data as { puesto?: number } | null)?.puesto ?? null;
        return {
          apuntado: true,
          puesto: contexto.simulado ? 2 : puesto,
          servicio: servicio?.nombre ?? null,
          simulado: contexto.simulado === true,
        };
      },
    },

    {
      nombre: 'mi_espera',
      requiere: 'lista_espera',
      descripcion:
        'Dice si el cliente está en la lista de espera, qué puesto ocupa y si tiene un hueco ofrecido ahora mismo.',
      parametros: ESQUEMA_VACIO,
      async ejecutar() {
        if (contexto.espera) return contexto.espera;
        const { data, error } = await contexto.rpc('wa_espera_mia', {
          p_barberia: contexto.barberiaId,
          p_telefono: contexto.telefono,
        });
        if (error) return { error: error.message };
        if (!data) return { en_espera: false };
        return data as Json;
      },
    },

    {
      nombre: 'oferta',
      requiere: 'lista_espera',
      descripcion:
        'Acepta o rechaza el hueco que se le ha ofrecido al cliente. Solo vale si hay una oferta pendiente.',
      parametros: ESQUEMA_OFERTA,
      async ejecutar(argumentos) {
        const oferta = contexto.espera?.oferta;
        if (!oferta) return { error: 'sin_oferta' };

        const { data, error } = await escribir(contexto, 'wa_oferta_resolver', {
          p_oferta: oferta.id,
          p_aceptada: argumentos.aceptar === true,
        });
        if (error) return { error: error.message };
        const r = (data ?? {}) as { ok?: boolean; motivo?: string };
        if (r.ok === false) return { error: r.motivo ?? 'no_se_pudo' };

        return {
          aceptada: argumentos.aceptar === true,
          inicio: oferta.inicio,
          servicio: oferta.servicio,
          simulado: contexto.simulado === true,
        };
      },
    },

    /* ---------------- fidelización y recomendaciones ---------------- */

    {
      nombre: 'fidelizacion',
      requiere: 'fidelidad',
      descripcion:
        'Consulta los sellos del cliente, cuántos le faltan y si tiene un premio disponible. No canjea nada: eso se hace en el local.',
      parametros: ESQUEMA_VACIO,
      async ejecutar() {
        const { data, error } = await contexto.rpc('mis_sellos', {
          p_token: contexto.token,
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };
        return data ?? { sin_datos: true };
      },
    },

    {
      nombre: 'recomendaciones',
      requiere: 'recomendaciones',
      descripcion:
        'Sugiere qué le puede venir bien al cliente: su servicio habitual, alguno que no haya probado y si está cerca de un premio.',
      parametros: ESQUEMA_VACIO,
      async ejecutar() {
        if (!contexto.token) return { sin_historial: true };
        const { data, error } = await contexto.rpc('recomendar_cliente', {
          p_token: contexto.token,
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };
        return data ?? { sin_historial: true };
      },
    },

    /* ---------------- enlazar el teléfono con la ficha ---------------- */

    {
      nombre: 'pedir_codigo',
      descripcion:
        'Manda al cliente un código de 6 cifras para enlazar este WhatsApp con su ficha del local. Úsala cuando diga que ya es cliente pero no aparezca por su número.',
      parametros: ESQUEMA_VACIO,
      async ejecutar() {
        if (!contexto.telefono) return { error: 'sin_telefono' };
        if (contexto.simulado) return { enviado: true, codigo: '123456', simulado: true };

        const { data, error } = await contexto.rpc('wa_codigo_pedir', {
          p_barberia: contexto.barberiaId,
          p_telefono: contexto.telefono,
        });
        if (error) return { error: error.message };

        const r = (data ?? {}) as { codigo?: string; error?: string };
        if (r.error) return { error: r.error };
        return { enviado: true, codigo: r.codigo };
      },
    },
  ];

  return todas
    .filter((h) => !h.requiere || activa(contexto, h.requiere))
    .map(({ requiere: _requiere, ...resto }) => resto);
}

/** Solo para las pruebas: herramientas que no tocan nada. */
export function definiciones(funciones: Funciones = {}): HerramientaDef[] {
  return crearHerramientas({
    token: '',
    pin: null,
    slug: '',
    barberiaId: '',
    telefono: '',
    clienteId: null,
    funciones,
    servicios: [],
    rpc: async () => ({ data: null, error: null }),
  }).map(({ nombre, descripcion, parametros }) => ({ nombre, descripcion, parametros }));
}
