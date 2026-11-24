// JULEX · el complemento de recepción en Stripe
//
// Tres acciones, con la clave del servidor (nunca en el navegador):
//   estado   → ¿lo tiene puesto? ¿qué suscripción?
//   activar  → añade el ítem de 10 €/mes a la suscripción del local
//   cancelar → lo quita
//
// La verdad la tiene Stripe: el webhook sincroniza `barberias.recepcion_activa`
// cada vez que la suscripción cambia, también si se toca desde el panel de Stripe.

import Stripe from 'npm:stripe@16.12.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (c: unknown, s = 200) =>
  new Response(JSON.stringify(c), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' as never });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** El precio del complemento: del entorno o, si no, de la tabla de ajustes. */
async function precioComplemento(): Promise<string> {
  const delEntorno = Deno.env.get('STRIPE_PRICE_RECEPCION');
  if (delEntorno) return delEntorno;

  const { data } = await admin
    .from('config_secreta')
    .select('valor')
    .eq('clave', 'stripe_price_recepcion')
    .maybeSingle();
  return data?.valor ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);

  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion) return json({ estado: 'error', mensaje: 'sin_sesion' }, 401);

  const conSesion = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false },
  });

  const { data: usuario } = await conSesion.auth.getUser();
  if (!usuario?.user) return json({ estado: 'error', mensaje: 'sin_sesion' }, 401);

  const { data: barberiaId } = await conSesion.rpc('mi_barberia');
  if (!barberiaId) return json({ estado: 'error', mensaje: 'sin_local' }, 403);

  let cuerpo: { accion?: 'estado' | 'activar' | 'cancelar' } = {};
  try {
    cuerpo = await req.json();
  } catch {
    /* sin cuerpo: estado */
  }
  const accion = cuerpo.accion ?? 'estado';

  const { data: sus } = await admin
    .from('suscripciones')
    .select('stripe_subscription_id, estado')
    .eq('barberia_id', barberiaId)
    .maybeSingle();

  const { data: local } = await admin
    .from('barberias')
    .select('recepcion_activa, nombre')
    .eq('id', barberiaId)
    .maybeSingle();

  const precio = await precioComplemento();

  /* ---------- estado ---------- */
  if (accion === 'estado') {
    return json({
      estado: 'ok',
      pagada: Boolean(local?.recepcion_activa),
      suscripcion: sus?.stripe_subscription_id ?? null,
      precio_listo: Boolean(precio),
      mensaje: !precio
        ? 'El complemento aún no está dado de alta en Stripe.'
        : !sus?.stripe_subscription_id
          ? 'Este local no tiene suscripción de Stripe: cobra por transferencia. Para cobrar el complemento hace falta una tarjeta.'
          : 'Listo para activar.',
    });
  }

  if (!precio) return json({ estado: 'error', mensaje: 'El complemento no está dado de alta en Stripe.' }, 409);

  if (!sus?.stripe_subscription_id) {
    return json(
      {
        estado: 'error',
        mensaje:
          'Este local no tiene suscripción de Stripe. El complemento se cobra como un ítem de la cuota, y la cuota de este local va por transferencia.',
      },
      409,
    );
  }

  try {
    const suscripcion = await stripe.subscriptions.retrieve(sus.stripe_subscription_id);
    const item = suscripcion.items.data.find((i) => i.price.id === precio);

    if (accion === 'activar') {
      if (item) return json({ estado: 'ok', pagada: true, mensaje: 'Ya estaba activo.' });

      await stripe.subscriptions.update(sus.stripe_subscription_id, {
        items: [{ price: precio, quantity: 1 }],
        proration_behavior: 'create_prorations',
      });
      await admin.rpc('wa_recepcion_pagada', { p_barberia: barberiaId, p_activa: true });
      return json({ estado: 'ok', pagada: true, mensaje: 'Complemento añadido: 10 €/mes.' });
    }

    if (accion === 'cancelar') {
      if (!item) return json({ estado: 'ok', pagada: false, mensaje: 'No estaba puesto.' });
      await stripe.subscriptionItems.del(item.id, { proration_behavior: 'create_prorations' });
      await admin.rpc('wa_recepcion_pagada', { p_barberia: barberiaId, p_activa: false });
      return json({ estado: 'ok', pagada: false, mensaje: 'Complemento retirado.' });
    }

    return json({ estado: 'error', mensaje: 'accion' }, 400);
  } catch (e) {
    return json({ estado: 'error', mensaje: String((e as Error)?.message ?? e) }, 400);
  }
});
