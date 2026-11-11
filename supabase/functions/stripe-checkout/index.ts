// JULEX · Checkout del alta y la suscripción
//
// El barbero entra desde Ajustes; la función cobra el alta (30 €) con la
// tarjeta y guarda la tarjeta para la suscripción, que se crea en el
// webhook con 30 días de prueba (el alta incluye el primer mes).

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

    const barberiaId = barbero.barberia_id as string;

    const { data: local } = await admin
      .from('barberias')
      .select('nombre, correo_legal, tipo')
      .eq('id', barberiaId)
      .single();

    // Todos los llaveros del local, no solo los activos: al darse de alta
    // todavía no hay ninguno asignado y la cuota ya cuenta.
    const { count } = await admin
      .from('llaveros')
      .select('id', { count: 'exact', head: true })
      .eq('barberia_id', barberiaId)
      .neq('estado', 'retirado');

    const total = Math.max(15, count ?? 0);
    const cantidad = Math.min(40, total);
    const extras = Math.max(0, total - 40);

    const { data: sus } = await admin
      .from('suscripciones')
      .select('stripe_customer_id')
      .eq('barberia_id', barberiaId)
      .maybeSingle();

    let cliente = sus?.stripe_customer_id as string | undefined;
    if (!cliente) {
      const creado = await stripe.customers.create({
        name: local?.nombre ?? 'JULEX',
        email: local?.correo_legal || user.email || undefined,
        metadata: { barberia_id: barberiaId },
      });
      cliente = creado.id;
      await admin.from('suscripciones').upsert({
        barberia_id: barberiaId,
        stripe_customer_id: cliente,
        estado: 'sin_activar',
        cantidad,
      });
    }

    const origen = Deno.env.get('SITIO_URL') ?? req.headers.get('origin') ?? 'https://julex.pages.dev';

    const sesion = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: cliente,
      line_items: [
        {
          price: Deno.env.get('STRIPE_PRICE_ALTA')!,
          quantity: 1,
          // El IVA va en la línea: el precio está sin impuestos.
          tax_rates: [Deno.env.get('STRIPE_TAX_IVA')!],
        },
        ...(extras > 0
          ? [
              {
                price: Deno.env.get('STRIPE_PRICE_LLAVERO')!,
                quantity: extras,
                tax_rates: [Deno.env.get('STRIPE_TAX_IVA')!],
              },
            ]
          : []),
      ],
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: { barberia_id: barberiaId },
      },
      // Factura del alta, no solo el recibo: la necesita el negocio.
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: 'Alta JULEX con 15 llaveros y el primer mes incluido',
          metadata: { barberia_id: barberiaId },
        },
      },
      metadata: {
        barberia_id: barberiaId,
        tipo: 'alta',
        cantidad: String(cantidad),
        extras: String(extras),
      },
      success_url: `${origen}/barbero/ajustes?pago=ok`,
      cancel_url: `${origen}/barbero/ajustes?pago=cancelado`,
    });

    return json({ url: sesion.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
