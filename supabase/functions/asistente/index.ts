// JULEX · asistente del llavero
//
// El cliente escribe desde su tarjeta. Esta función carga lo que JULEX
// sabe del local y del cliente, recupera la conversación, deja que el
// modelo converse con las herramientas y guarda el turno con su coste.
// La clave del modelo no sale de aquí.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  conversar,
  proveedorGuion,
  proveedorOpenAI,
  calcularCoste,
  inicioDeMesMadrid,
  LimiteDeTurnos,
  type Mensaje,
} from './engine.ts';
import { construirSistema } from './prompt.ts';
import { crearHerramientas } from './herramientas.ts';

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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function numero(nombre: string, porDefecto: number): number {
  const valor = Number(Deno.env.get(nombre));
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

const TOPE_CONVERSACIONES = numero('ASISTENTE_TOPE_CONVERSACIONES', 300);
const TOPE_MENSAJES_MES = numero('ASISTENTE_TOPE_MENSAJES_MES', 1500);
const TOPE_MENSAJES_24H = numero('ASISTENTE_TOPE_MENSAJES_24H', 60);
const TOPE_MENSAJES_DIA = numero('ASISTENTE_TOPE_MENSAJES_DIA', 3000);
const MAX_MENSAJES_CONVERSACION = numero('ASISTENTE_MAX_MENSAJES_CONVERSACION', 30);
const PRECIO_ENTRADA = numero('ASISTENTE_PRECIO_ENTRADA', 0.3);
const PRECIO_SALIDA = numero('ASISTENTE_PRECIO_SALIDA', 1.2);
const HISTORIAL = 10;

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
  if (ficha.estado !== 'abierta') return json({ estado: ficha.estado }, 409);

  const barberiaId = ficha.barberia_id as string;
  const clienteId = ficha.cliente.id as string;

  // 2. La conversación que manda el navegador solo vale si es suya.
  let conversacionId: string | null = null;
  let historial: Mensaje[] = [];
  if (cuerpo.conversacion_id) {
    const { data: suya } = await admin
      .from('asistente_conversacion')
      .select('id, cliente_id, barberia_id')
      .eq('id', cuerpo.conversacion_id)
      .maybeSingle();

    if (suya && suya.cliente_id === clienteId && suya.barberia_id === barberiaId) {
      conversacionId = suya.id;
    }
  }

  // 3. Topes. Primero los de la conversación, luego los de la tarjeta y el mes.
  if (conversacionId) {
    const { count } = await admin
      .from('asistente_mensaje')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conversacionId);
    if ((count ?? 0) >= MAX_MENSAJES_CONVERSACION) return json({ estado: 'tope' }, 409);

    const { data: previos } = await admin
      .from('asistente_mensaje')
      .select('papel, texto')
      .eq('conversacion_id', conversacionId)
      .in('papel', ['cliente', 'asistente'])
      .order('creado_en', { ascending: false })
      .limit(HISTORIAL);

    historial = ((previos ?? []) as { papel: string; texto: string }[])
      .reverse()
      .map((m) => ({ papel: m.papel as 'cliente' | 'asistente', texto: m.texto.slice(0, 800) }));
  }

  const [{ data: en24h }, { data: enMes }, { data: hoy }] = await Promise.all([
    admin.rpc('asistente_mensajes_24h', { p_cliente: clienteId }),
    admin.rpc('asistente_mensajes_mes', { p_barberia: barberiaId }),
    admin.rpc('asistente_mensajes_hoy'),
  ]);

  if ((en24h ?? 0) >= TOPE_MENSAJES_24H) return json({ estado: 'tope' }, 429);
  if ((enMes ?? 0) >= TOPE_MENSAJES_MES) return json({ estado: 'tope' }, 409);
  if ((hoy ?? 0) >= TOPE_MENSAJES_DIA) return json({ estado: 'sin_servicio' }, 503);

  const { count: conversaciones } = await admin
    .from('asistente_conversacion')
    .select('id', { count: 'exact', head: true })
    .eq('barberia_id', barberiaId)
    .gte('abierta_en', inicioDeMesMadrid());
  if ((conversaciones ?? 0) >= TOPE_CONVERSACIONES) return json({ estado: 'tope' }, 409);

  // 4. Lo que el prompt necesita del local.
  const [{ data: servicios }, { data: horarios }] = await Promise.all([
    admin
      .from('servicios')
      .select('id, nombre, precio, minutos')
      .eq('barberia_id', barberiaId)
      .eq('activo', true)
      .order('orden'),
    admin
      .from('horarios')
      .select('dia_semana, abre, cierra, descanso_desde, descanso_hasta')
      .eq('barberia_id', barberiaId)
      .order('dia_semana'),
  ]);

  const sistema = construirSistema(
    {
      nombre: ficha.local.nombre,
      direccion: ficha.local.direccion,
      telefono: ficha.local.telefono,
      asistente: ficha.asistente?.nombre ?? null,
      servicios: (servicios ?? []).map((s) => ({
        nombre: s.nombre,
        precio: Number(s.precio),
        minutos: s.minutos,
      })),
      horarios: (horarios ?? []).map((h) => ({
        dia: DIAS[h.dia_semana] ?? String(h.dia_semana),
        abre: String(h.abre).slice(0, 5),
        cierra: String(h.cierra).slice(0, 5),
        descanso_desde: h.descanso_desde ? String(h.descanso_desde).slice(0, 5) : null,
        descanso_hasta: h.descanso_hasta ? String(h.descanso_hasta).slice(0, 5) : null,
      })),
    },
    {
      nombre: ficha.cliente.nombre,
      sellos: ficha.cliente.sellos,
      proxima: ficha.proxima,
      ultimaVisita: ficha.ultima_visita,
    },
  );

  // 5. Proveedor: el real si hay configuración; si no, uno de prueba.
  const llmUrl = Deno.env.get('ASISTENTE_LLM_URL');
  const llmClave = Deno.env.get('ASISTENTE_LLM_KEY');
  const proveedor =
    llmUrl && llmClave
      ? proveedorOpenAI({
          url: llmUrl,
          clave: llmClave,
          modelo: Deno.env.get('ASISTENTE_LLM_MODEL') ?? 'deepseek-flash',
        })
      : proveedorGuion([{ texto: 'Estoy en modo prueba: todavía no hay modelo configurado.' }]);

  let resultado;
  try {
    resultado = await conversar({
      proveedor,
      sistema,
      mensajes: [...historial, { papel: 'cliente', texto: mensaje }],
      herramientas: crearHerramientas({
        token,
        pin: cuerpo.pin ?? null,
        slug: ficha.local.slug,
        servicios: (servicios ?? []).map((s) => ({
          id: s.id,
          nombre: s.nombre,
          minutos: s.minutos,
        })),
        rpc: (funcion, argumentos) => anon.rpc(funcion, argumentos),
      }),
    });
  } catch (error) {
    if (error instanceof LimiteDeTurnos) {
      return json({ estado: 'derivado', respuesta: 'Mejor te lo cuenta una persona del local.' }, 200);
    }
    console.error('asistente', error);
    return json({ error: 'asistente' }, 500);
  }

  // 6. Registrar el turno. Si falla el registro, la respuesta no se pierde.
  const derivo = resultado.llamadas.includes('pasar_al_barbero');
  const resultadoConversacion = resultado.llamadas.includes('reservar')
    ? 'cita'
    : resultado.llamadas.includes('proponer_ficha')
      ? 'ficha'
      : derivo
        ? 'ninguno'
        : 'consulta';

  try {
    if (!conversacionId) {
      const { data: creada } = await admin
        .from('asistente_conversacion')
        .insert({ barberia_id: barberiaId, cliente_id: clienteId })
        .select('id')
        .single();
      conversacionId = creada?.id ?? null;
    }

    if (conversacionId) {
      await admin.from('asistente_mensaje').insert([
        { conversacion_id: conversacionId, papel: 'cliente', texto: mensaje },
        { conversacion_id: conversacionId, papel: 'asistente', texto: resultado.texto },
      ]);

      await admin.rpc('asistente_registrar_turno', {
        p_conversacion: conversacionId,
        p_entrada: resultado.uso.entrada,
        p_salida: resultado.uso.salida,
        p_coste: calcularCoste(resultado.uso, PRECIO_ENTRADA, PRECIO_SALIDA),
        p_resultado: resultadoConversacion,
        p_derivada: derivo,
      });
    }
  } catch (error) {
    console.error('registro', error);
  }

  return json({ estado: 'abierta', respuesta: resultado.texto, conversacion_id: conversacionId });
});
