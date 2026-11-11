// JULEX · Pausa de la suscripción
//
// Vacaciones o un cierre temporal: se deja de cobrar y se reanuda sola.
// Máximo 30 días, que es lo que se compromete en las condiciones.

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
    const { accion } = await req.json().catch(() => ({ accion: 'pausar' }));
    if (!['pausar', 'reanudar'].includes(accion)) return json({ error: 'accion_invalida' }, 400);

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
      .select('stripe_subscription_id')
      .eq('barberia_id', barbero.barberia_id)
      .maybeSingle();
    if (!sus?.stripe_subscription_id) return json({ error: 'sin_suscripcion' }, 404);

    if (accion === 'pausar') {
      const hasta = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await stripe.subscriptions.update(sus.stripe_subscription_id as string, {
        pause_collection: {
          behavior: 'void',
          resumes_at: Math.floor(hasta.getTime() / 1000),
        },
      });

      await admin
        .from('suscripciones')
        .update({ estado: 'pausada', pausa_hasta: hasta.toISOString().slice(0, 10) })
        .eq('barberia_id', barbero.barberia_id);

      return json({ pausada_hasta: hasta.toISOString().slice(0, 10) });
    }

    await stripe.subscriptions.update(sus.stripe_subscription_id as string, {
      pause_collection: '' as unknown as null,
    });

    await admin
      .from('suscripciones')
      .update({ estado: 'activa', pausa_hasta: null })
      .eq('barberia_id', barbero.barberia_id);

    return json({ reanudada: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
