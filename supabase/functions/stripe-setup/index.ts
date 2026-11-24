// Temporal: crea el producto y el precio del complemento en Stripe.
// Se borra en cuanto devuelve el precio. Protegido con un secreto.
import Stripe from 'npm:stripe@16.12.0';

const SECRETO = Deno.env.get('CRON_SECRET') ?? '';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' as never });

Deno.serve(async (req) => {
  if (req.headers.get('x-julex-setup') !== SECRETO || !SECRETO) {
    return new Response('no', { status: 401 });
  }

  const productos = await stripe.products.search({ query: "name:'Recepción WhatsApp'" });
  const producto =
    productos.data[0] ??
    (await stripe.products.create({
      name: 'Recepción WhatsApp',
      description: 'Recepcionista virtual por WhatsApp para el local',
    }));

  const precios = await stripe.prices.list({ product: producto.id, active: true, limit: 10 });
  const precio =
    precios.data.find((p) => p.unit_amount === 1000 && p.recurring?.interval === 'month') ??
    (await stripe.prices.create({
      product: producto.id,
      currency: 'eur',
      unit_amount: 1000,
      recurring: { interval: 'month' },
    }));

  return new Response(
    JSON.stringify({
      producto: producto.id,
      precio: precio.id,
      importe: (precio.unit_amount ?? 0) / 100,
      moneda: precio.currency,
      intervalo: precio.recurring?.interval,
      modo: (Deno.env.get('STRIPE_SECRET_KEY') ?? '').includes('_test_') ? 'test' : 'live',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
