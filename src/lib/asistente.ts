// JULEX · el asistente del llavero, visto desde el navegador
//
// Dos modos, como el resto de la app: con Supabase habla con la función
// «asistente»; sin Supabase (demo) responde en local y lo dice.

import { haySupabase, supabase } from './supabase';

export type Variante = 'cita' | 'cola' | 'premio' | 'ausencia' | 'nuevo' | 'normal';

export interface EstadoAsistente {
  estado: 'abierta' | 'apagado' | 'suspendido' | 'denegada' | 'bloqueada' | 'no_existe';
  nombre: string | null;
  variante: Variante;
  proxima: { inicio: string; servicio: string; silla: string | null } | null;
  ultimaVisita: string | null;
}

export interface RespuestaAsistente {
  texto: string;
  conversacionId: string | null;
  estado: 'abierta' | 'tope' | 'derivado';
}

const CERRADO = 'julex.asistente.cerrado.';

export function estabaCerrado(token: string): boolean {
  try {
    return sessionStorage.getItem(CERRADO + token) === '1';
  } catch {
    return false;
  }
}

export function recordarCerrado(token: string) {
  try {
    sessionStorage.setItem(CERRADO + token, '1');
  } catch {
    /* sin almacenamiento, no pasa nada: se vuelve a abrir */
  }
}

/** La variante que tocaría, calculada con lo que ya trae la tarjeta. */
export async function estadoAsistente(token: string, pin: string | null): Promise<EstadoAsistente> {
  if (!haySupabase || !supabase) {
    return { estado: 'abierta', nombre: null, variante: 'normal', proxima: null, ultimaVisita: null };
  }

  const { data, error } = await supabase.rpc('asistente_publico', { p_token: token, p_pin: pin });
  if (error) throw new Error(error.message);
  if (!data) return { estado: 'no_existe', nombre: null, variante: 'normal', proxima: null, ultimaVisita: null };

  const r = data as Record<string, any>;
  if (r.estado !== 'abierta') {
    return {
      estado: r.estado,
      nombre: null,
      variante: 'normal',
      proxima: null,
      ultimaVisita: null,
    };
  }

  return {
    estado: 'abierta',
    nombre: r.asistente?.nombre ? String(r.asistente.nombre) : null,
    variante: (r.variante ?? 'normal') as Variante,
    proxima: r.proxima
      ? {
          inicio: String(r.proxima.inicio),
          servicio: String(r.proxima.servicio ?? ''),
          silla: r.proxima.silla ? String(r.proxima.silla) : null,
        }
      : null,
    ultimaVisita: r.ultima_visita ? String(r.ultima_visita) : null,
  };
}

export async function hablar(entrada: {
  token: string;
  pin: string | null;
  conversacionId: string | null;
  mensaje: string;
}): Promise<RespuestaAsistente> {
  if (!haySupabase || !supabase) return respuestaDemo(entrada.mensaje);

  const { data, error } = await supabase.functions.invoke('asistente', {
    body: {
      token: entrada.token,
      pin: entrada.pin,
      conversacion_id: entrada.conversacionId,
      mensaje: entrada.mensaje,
    },
  });

  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { estado?: string; respuesta?: string; conversacion_id?: string | null };

  return {
    texto: String(r.respuesta ?? ''),
    conversacionId: r.conversacion_id ?? null,
    estado: (r.estado as RespuestaAsistente['estado']) ?? 'abierta',
  };
}

/* ------------------------------------------------------------------ */
/* Modo demo                                                          */
/* ------------------------------------------------------------------ */

function respuestaDemo(mensaje: string): RespuestaAsistente {
  const texto = mensaje.toLowerCase();

  if (/cita|hueco|reserv|viernes|lunes|martes|miércoles|jueves|sábado|domingo/.test(texto)) {
    return {
      texto:
        'Perfecto. En la demo no puedo mirar la agenda, pero en cuanto el local esté conectado te enseño sus huecos reales y te dejo la cita hecha.',
      conversacionId: null,
      estado: 'abierta',
    };
  }

  if (/corte|pelo|barba|fade|maquinilla|prefier|gusta/.test(texto)) {
    return {
      texto:
        'Cuéntame: ¿cómo lo quieres esta vez? En la demo no se guarda, pero en el local tu barbero lo vería antes de que te sientes.',
      conversacionId: null,
      estado: 'abierta',
    };
  }

  return {
    texto:
      'Estoy en modo demostración. Cuando el local esté conectado, te reservo la cita y apunto cómo te gusta el corte.',
    conversacionId: null,
    estado: 'abierta',
  };
}
