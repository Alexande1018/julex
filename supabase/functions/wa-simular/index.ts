// JULEX · conversación de prueba
//
// El dueño ve a su recepcionista funcionar antes de conectar nada. Es
// una prueba de verdad —mismo motor, mismo prompt, mismos servicios y
// horarios— pero con el freno puesto: no escribe en la agenda, no toca
// sus clientes y no cuenta en las métricas.
//
// Solo el dueño, con su sesión.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { ejecutarTurno } from '../asistente/turno.ts';
import { proveedorOpenAI, proveedorGuion, type Mensaje, type Proveedor } from '../asistente/engine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function proveedor(): Proveedor {
  const url = Deno.env.get('ASISTENTE_LLM_URL');
  const clave = Deno.env.get('ASISTENTE_LLM_KEY');
  if (!url || !clave) {
    return proveedorGuion([
      {
        texto:
          'Estoy en modo prueba y todavía no hay modelo conectado. Cuando lo haya, esta misma conversación usará los servicios y horarios reales de tu local.',
      },
    ]);
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

  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion) return json({ error: 'sin_sesion' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const conSesion = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: usuario } = await conSesion.auth.getUser();
  if (!usuario?.user) return json({ error: 'sin_sesion' }, 401);

  const { data: barberiaId } = await conSesion.rpc('mi_barberia');
  if (!barberiaId) return json({ error: 'sin_local' }, 403);

  let cuerpo: { mensaje?: string; historial?: { papel?: string; texto?: string }[] };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'cuerpo' }, 400);
  }

  const mensaje = String(cuerpo.mensaje ?? '').trim().slice(0, 1000);
  if (mensaje.length < 1) return json({ error: 'mensaje' }, 400);

  const historial: Mensaje[] = (cuerpo.historial ?? [])
    .filter((m) => (m.papel === 'cliente' || m.papel === 'asistente') && m.texto)
    .slice(-10)
    .map((m) => ({ papel: m.papel as 'cliente' | 'asistente', texto: String(m.texto).slice(0, 800) }));

  const { data: local } = await admin
    .from('barberias')
    .select('id, nombre, slug, telefono, direccion')
    .eq('id', barberiaId)
    .maybeSingle();
  if (!local) return json({ error: 'sin_local' }, 404);

  const { data: config } = await admin
    .from('asistente_config')
    .select('nombre, personalidad, bienvenida, funciones')
    .eq('barberia_id', barberiaId)
    .maybeSingle();

  const funciones = (config?.funciones ?? {}) as Record<string, boolean>;

  try {
    const turno = await ejecutarTurno({
      admin,
      anon: conSesion,
      barberiaId,
      slug: local.slug,
      canal: 'whatsapp',
      telefono: '',
      token: '',
      pin: null,
      clienteId: null,
      mensaje,
      conversacionId: null,
      historial,
      local: {
        nombre: local.nombre,
        direccion: local.direccion ?? '',
        telefono: local.telefono ?? '',
        asistente: config?.nombre ?? null,
        personalidad: config?.personalidad ?? 'cercano',
        bienvenida: config?.bienvenida ?? '',
        funciones,
        servicios: [],
        horarios: [],
      },
      // Un cliente de mentira, para que la prueba se parezca a la vida.
      cliente: {
        nombre: 'Cliente de prueba',
        vinculado: true,
        sellos: { en_ciclo: 7, meta: 10, faltan: 3, disponibles: 0 },
        proxima: null,
        ultimaVisita: null,
      },
      funciones,
      simulado: true,
      sinRegistro: true,
      proveedor: proveedor(),
    });

    return json({
      respuesta: turno.respuesta,
      herramientas: turno.llamadas,
      estado: turno.estado,
    });
  } catch (error) {
    console.error('simular', error);
    return json({ error: 'simular' }, 500);
  }
});
