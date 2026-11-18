// JULEX · herramientas del asistente
//
// El modelo no toca la base de datos: pide estas operaciones y el
// servidor las valida y las ejecuta contra las RPC que ya existen.

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

export const ESQUEMAS = {
  huecos: ESQUEMA_HUECOS,
  reservar: ESQUEMA_RESERVAR,
  cancelar: ESQUEMA_CANCELAR,
  mover: ESQUEMA_MOVER,
  proponer_ficha: ESQUEMA_FICHA,
  pasar_al_barbero: ESQUEMA_DERIVAR,
};

/* ------------------------------------------------------------------ */
/* Contexto                                                           */
/* ------------------------------------------------------------------ */

export interface ServicioLocal {
  id: string;
  nombre: string;
  minutos: number;
}

export interface RespuestaRpc {
  data: unknown;
  error: { message: string } | null;
}

export interface Contexto {
  token: string;
  pin: string | null;
  slug: string;
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

function buscarServicio(contexto: Contexto, nombre: string): ServicioLocal {
  const buscado = normalizar(nombre);
  const exacto = contexto.servicios.find((s) => normalizar(s.nombre) === buscado);
  if (exacto) return exacto;

  const parciales = contexto.servicios.filter((s) => normalizar(s.nombre).includes(buscado));
  if (parciales.length === 1) return parciales[0];

  const nombres = contexto.servicios.map((s) => s.nombre).join(', ');
  throw new Error(`servicio_desconocido: ${nombres}`);
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
  return [
    {
      nombre: 'huecos',
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

        const { data, error } = await contexto.rpc('solicitar_cita', {
          p_slug: contexto.slug,
          p_servicio: servicio.id,
          p_inicio: inicio,
          p_nombre: '',
          p_telefono: '',
          p_token: contexto.token,
          p_origen: 'asistente',
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };

        return { reservada: true, cita: data, servicio: servicio.nombre, inicio };
      },
    },

    {
      nombre: 'cancelar',
      descripcion: 'Cancela la cita del cliente que empieza en ese instante.',
      parametros: ESQUEMA_CANCELAR,
      async ejecutar(argumentos) {
        const inicio = String(argumentos.inicio);

        const { data, error } = await contexto.rpc('mis_citas', {
          p_token: contexto.token,
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };

        const citas = (data as { citas?: { id: string; inicio: string }[] } | null)?.citas ?? [];
        const cita = citas.find((c) => mismoInstante(c.inicio, inicio));
        if (!cita) return { error: 'cita_no_encontrada' };

        const cancelacion = await contexto.rpc('cancelar_cita', {
          p_token: contexto.token,
          p_cita: cita.id,
          p_pin: contexto.pin,
        });
        if (cancelacion.error) return { error: cancelacion.error.message };
        if (cancelacion.data !== true) return { error: 'no_se_puede_cancelar' };

        return { cancelada: true, inicio };
      },
    },

    {
      nombre: 'mover',
      descripcion: 'Mueve la cita del cliente a otro instante, si el hueco está libre.',
      parametros: ESQUEMA_MOVER,
      async ejecutar(argumentos) {
        const actual = String(argumentos.inicio_actual);
        const nuevo = String(argumentos.inicio_nuevo);

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

        const movimiento = await contexto.rpc('mover_cita', {
          p_token: contexto.token,
          p_cita: cita.id,
          p_inicio: nuevo,
          p_pin: contexto.pin,
        });
        if (movimiento.error) return { error: movimiento.error.message };

        return { movida: true, cita: movimiento.data, inicio: nuevo };
      },
    },

    {
      nombre: 'proponer_ficha',
      descripcion:
        'Guarda lo que el cliente ha contado sobre cómo quiere el corte o sus preferencias. El barbero lo revisa.',
      parametros: ESQUEMA_FICHA,
      async ejecutar(argumentos) {
        const { data, error } = await contexto.rpc('proponer_ficha', {
          p_token: contexto.token,
          p_como_corta: String(argumentos.como_corta ?? ''),
          p_preferencias: String(argumentos.preferencias ?? ''),
          p_texto_original: String(argumentos.texto_original ?? ''),
          p_pin: contexto.pin,
        });
        if (error) return { error: error.message };
        return { guardada: true, propuesta: data };
      },
    },

    {
      nombre: 'pasar_al_barbero',
      descripcion:
        'Avisa al barbero de que el cliente necesita una persona. Úsala si no entiendes, si pide algo raro o si se queja.',
      parametros: ESQUEMA_DERIVAR,
      async ejecutar(argumentos) {
        return { derivado: true, motivo: String(argumentos.motivo ?? '') };
      },
    },
  ];
}

/** Solo para las pruebas: herramientas que no tocan nada. */
export function definiciones(): HerramientaDef[] {
  return crearHerramientas({
    token: '',
    pin: null,
    slug: '',
    servicios: [],
    rpc: async () => ({ data: null, error: null }),
  }).map(({ nombre, descripcion, parametros }) => ({ nombre, descripcion, parametros }));
}
