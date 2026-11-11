// JULEX · Portal del cliente de Stripe
//
// «Gestionar suscripción» en Ajustes: cambiar tarjeta, ver facturas y
// darse de baja (a final de mes pagado).

import Stripe from 'https://esm.sh/stripe@16.12.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'sin_sesion' }, 401);

    const comoUsuario = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'sin_sesion' }, 401);

    const { data: barbero } = await admin
      .from('barberos')
      .select('barberia_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!barbero) return json({ error: 'sin_local' }, 403);

    const { data: sus } = await admin
      .from('suscripciones')
      .select('stripe_customer_id')
      .eq('barberia_id', barbero.barberia_id)
      .maybeSingle();

    if (!sus?.stripe_customer_id) return json({ error: 'sin_suscripcion' }, 404);

    const origen = Deno.env.get('SITIO_URL') ?? req.headers.get('origin') ?? 'https://julex.pages.dev';

    const sesion = await stripe.billingPortal.sessions.create({
      customer: sus.stripe_customer_id as string,
      configuration: Deno.env.get('STRIPE_PORTAL_CONFIG') || undefined,
      return_url: `${origen}/barbero/ajustes`,
    });

    return json({ url: sesion.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
