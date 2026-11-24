// JULEX · el asistente del llavero
//
// El cliente escribe desde su tarjeta. Esta función resuelve QUIÉN es
// (el token del llavero y su PIN), carga lo que JULEX sabe del local y
// del cliente, y le pasa el turno al motor compartido.
//
// La misma cabeza atiende el WhatsApp: ver ../wa-webhook.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { proveedorGuion, proveedorOpenAI, type Proveedor } from './engine.ts';
import { ejecutarTurno } from './turno.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** El proveedor real si hay configuración; si no, uno de prueba. */
function proveedorDeEntorno(): Proveedor {
  const url = Deno.env.get('ASISTENTE_LLM_URL');
  const clave = Deno.env.get('ASISTENTE_LLM_KEY');
  if (!url || !clave) {
    return proveedorGuion([{ texto: 'Estoy en modo prueba: todavía no hay modelo configurado.' }]);
  }
  return proveedorOpenAI({
    url,
    clave,
    modelo: Deno.env.get('ASISTENTE_LLM_MODEL') ?? 'deepseek-flash',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);

  let cuerpo: { token?: string; pin?: string | null; conversacion_id?: string | null; mensaje?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'cuerpo' }, 400);
  }

  const token = (cuerpo.token ?? '').trim();
  const mensaje = (cuerpo.mensaje ?? '').trim();
  if (!token) return json({ error: 'sin_token' }, 400);
  if (mensaje.length < 1 || mensaje.length > 1000) return json({ error: 'mensaje' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // 1. ¿Quién es y puede hablar? La tarjeta y el PIN mandan.
  const { data: ficha, error: errorFicha } = await anon.rpc('asistente_publico', {
    p_token: token,
    p_pin: cuerpo.pin ?? null,
  });
  if (errorFicha) return json({ error: 'ficha' }, 500);
  if (!ficha) return json({ estado: 'no_existe' }, 404);

  const f = ficha as {
    estado: string;
    barberia_id?: string;
    asistente?: { nombre?: string | null };
    local?: { nombre: string; slug: string; telefono?: string; direccion?: string };
    cliente?: {
      id: string;
      nombre: string;
      sellos?: { en_ciclo: number; meta: number; faltan: number; disponibles: number };
      proxima?: { inicio: string; servicio: string; silla?: string | null } | null;
    };
    proxima?: { inicio: string; servicio: string; silla?: string | null } | null;
    ultima_visita?: string | null;
  };

  if (f.estado !== 'abierta' || !f.barberia_id || !f.cliente || !f.local) {
    return json({ estado: f.estado }, 409);
  }

  // 2. Los ajustes del local: tono, funciones y nombre del asistente.
  const { data: config } = await admin
    .from('asistente_config')
    .select('nombre, personalidad, bienvenida, funciones, avatar_id')
    .eq('barberia_id', f.barberia_id)
    .maybeSingle();

  try {
    const turno = await ejecutarTurno({
      admin,
      anon,
      barberiaId: f.barberia_id,
      slug: f.local.slug,
      canal: 'llavero',
      telefono: '',
      token,
      pin: cuerpo.pin ?? null,
      clienteId: f.cliente.id,
      mensaje,
      conversacionId: cuerpo.conversacion_id ?? null,
      local: {
        nombre: f.local.nombre,
        direccion: f.local.direccion,
        telefono: f.local.telefono,
        asistente: config?.nombre ?? f.asistente?.nombre ?? null,
        personalidad: config?.personalidad ?? 'cercano',
        bienvenida: config?.bienvenida ?? '',
        funciones: (config?.funciones ?? {}) as Record<string, boolean>,
        servicios: [],
        horarios: [],
      },
      cliente: {
        nombre: f.cliente.nombre,
        vinculado: true,
        sellos: f.cliente.sellos,
        proxima: f.cliente.proxima ?? f.proxima ?? null,
        ultimaVisita: f.ultima_visita ?? null,
      },
      funciones: (config?.funciones ?? {}) as Record<string, boolean>,
      proveedor: proveedorDeEntorno(),
    });

    return json({
      estado: turno.estado,
      respuesta: turno.respuesta,
      conversacion_id: turno.conversacionId,
    });
  } catch (error) {
    console.error('asistente', error);
    return json({ error: 'asistente' }, 500);
  }
});
