// JULEX · conectar el WhatsApp del local
//
// La idea es que el dueño no rellene nada: pulsa «Conectar WhatsApp»,
// entra con su cuenta de Meta (Embedded Signup), elige su número y
// vuelve. Aquí se cambia el código que devuelve Meta por un token, se
// suscribe la app a su cuenta y se guarda la línea en modo prueba.
//
// Si la app de JULEX todavía no está configurada en Meta, esto responde
// «pendiente» y el panel lo dice claro. No se simula una conexión que
// no existe.
//
// Variables de entorno:
//   META_APP_ID, META_APP_SECRET, META_CONFIG_ID  → Embedded Signup
//   WA_REDIRECT_URI                               → vuelta al panel

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { GRAPH, telefonoVisible } from '../_shared/wa.ts';

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

const APP_ID = Deno.env.get('META_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
const CONFIG_ID = Deno.env.get('META_CONFIG_ID') ?? '';
const VUELTA = Deno.env.get('WA_REDIRECT_URI') ?? '';

interface Cuerpo {
  accion?: 'estado' | 'url' | 'guardar';
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);

  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion) return json({ estado: 'error', mensaje: 'sin_sesion' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const conSesion = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: usuario } = await conSesion.auth.getUser();
  if (!usuario?.user) return json({ estado: 'error', mensaje: 'sin_sesion' }, 401);

  const { data: barberiaId } = await conSesion.rpc('mi_barberia');
  if (!barberiaId) return json({ estado: 'error', mensaje: 'sin_local' }, 403);

  let cuerpo: Cuerpo = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* sin cuerpo: se pregunta el estado */
  }
  const accion = cuerpo.accion ?? 'estado';
  const configurado = Boolean(APP_ID && APP_SECRET && CONFIG_ID);

  /* ---------- 1. ¿Cómo está esto? ---------- */
  if (accion === 'estado') {
    const { data: linea } = await admin
      .from('wa_linea')
      .select('telefono_visible, estado, modo, conectada_en')
      .eq('barberia_id', barberiaId)
      .maybeSingle();

    if (linea?.estado === 'activa') {
      return json({
        estado: 'conectado',
        mensaje:
          linea.modo === 'prueba'
            ? 'Conectado en modo prueba: escríbete a ti mismo para verlo.'
            : 'Conectado y atendiendo.',
        telefono: linea.telefono_visible,
        modo: linea.modo,
      });
    }

    return json({
      estado: 'pendiente',
      configurado,
      mensaje: configurado
        ? 'Sin conectar todavía. Pulsa «Conectar WhatsApp».'
        : 'El canal de WhatsApp aún no está habilitado en JULEX. Estamos terminando la verificación con Meta: mientras tanto puedes probar a tu recepcionista en el simulador.',
    });
  }

  /* ---------- 2. La dirección a la que mandar al dueño ---------- */
  if (accion === 'url') {
    if (!configurado) {
      return json({
        estado: 'pendiente',
        mensaje: 'El canal de WhatsApp aún no está habilitado en JULEX.',
      });
    }

    const destino = new URL('https://www.facebook.com/dialog/oauth');
    destino.searchParams.set('client_id', APP_ID);
    destino.searchParams.set('config_id', CONFIG_ID);
    destino.searchParams.set('response_type', 'code');
    destino.searchParams.set('override_default_response_type', 'true');
    destino.searchParams.set('extras', JSON.stringify({ setup: {} }));
    if (VUELTA) destino.searchParams.set('redirect_uri', VUELTA);

    return json({ estado: 'pendiente', url: destino.toString() });
  }

  /* ---------- 3. Guardar lo que devuelve Meta ---------- */
  if (accion === 'guardar') {
    if (!configurado) {
      return json({ estado: 'error', mensaje: 'El canal no está configurado.' });
    }
    if (!cuerpo.code || !cuerpo.waba_id || !cuerpo.phone_number_id) {
      return json({ estado: 'error', mensaje: 'Faltan datos de Meta.' });
    }

    // 3.1 El código de un solo uso se cambia por un token de larga vida.
    const intercambio = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: APP_ID,
          client_secret: APP_SECRET,
          code: cuerpo.code,
        }).toString(),
      { signal: AbortSignal.timeout(15_000) },
    );

    const datos = (await intercambio.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!intercambio.ok || !datos.access_token) {
      await admin
        .from('wa_linea')
        .upsert(
          {
            barberia_id: barberiaId,
            estado: 'pendiente',
            ultimo_error: datos.error?.message ?? `meta_${intercambio.status}`,
          },
          { onConflict: 'barberia_id' },
        );
      return json({ estado: 'error', mensaje: 'Meta no ha aceptado la conexión. Inténtalo otra vez.' });
    }

    const token = datos.access_token;

    // 3.2 La app se suscribe a la cuenta del negocio: sin esto no llegan
    // los mensajes de ese número.
    const suscripcion = await fetch(`${GRAPH}/${cuerpo.waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!suscripcion.ok) {
      await admin
        .from('wa_linea')
        .upsert(
          {
            barberia_id: barberiaId,
            estado: 'pendiente',
            ultimo_error: 'no_suscrito',
          },
          { onConflict: 'barberia_id' },
        );
      return json({ estado: 'error', mensaje: 'No se ha podido suscribir el número. Inténtalo otra vez.' });
    }

    // 3.3 El número, tal y como lo ve el cliente.
    const info = await fetch(
      `${GRAPH}/${cuerpo.phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
    );
    const numero = (await info.json().catch(() => ({}))) as { display_phone_number?: string };
    const soloDigitos = String(numero.display_phone_number ?? '').replace(/\D/g, '');

    // 3.4 Se guarda. Nace en modo prueba: el dueño se escribe a sí mismo
    // y lo ve funcionar antes de que le conteste a un cliente.
    await admin.from('wa_secreto').upsert(
      { barberia_id: barberiaId, token, actualizado_en: new Date().toISOString() },
      { onConflict: 'barberia_id' },
    );

    const { error: errorLinea } = await admin.from('wa_linea').upsert(
      {
        barberia_id: barberiaId,
        telefono: soloDigitos || '',
        telefono_visible: soloDigitos ? telefonoVisible(soloDigitos) : '',
        estado: 'activa',
        modo: 'prueba',
        waba_id: cuerpo.waba_id,
        phone_number_id: cuerpo.phone_number_id,
        conectada_en: new Date().toISOString(),
        ultimo_error: '',
        autorizados: soloDigitos ? [soloDigitos] : [],
      },
      { onConflict: 'barberia_id' },
    );

    if (errorLinea) {
      return json({ estado: 'error', mensaje: errorLinea.message });
    }

    await admin
      .from('asistente_config')
      .upsert({ barberia_id: barberiaId, canal_whatsapp: true }, { onConflict: 'barberia_id' });

    return json({
      estado: 'conectado',
      modo: 'prueba',
      telefono: soloDigitos ? telefonoVisible(soloDigitos) : '',
      mensaje: 'Conectado. Escríbete a ti mismo desde tu móvil para verlo funcionar.',
    });
  }

  return json({ estado: 'error', mensaje: 'accion' }, 400);
});
