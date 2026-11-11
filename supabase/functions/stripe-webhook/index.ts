// JULEX · Webhook de Stripe
//
// Es la única pieza que habla con la base como servicio. Recibe los avisos,
// verifica la firma y deja el estado en `suscripciones` y `barberias`:
//
//   checkout.session.completed  → cobra el alta y crea la suscripción
//   customer.subscription.*     → estado, cantidad y fin de periodo
//   invoice.paid / failed       → al día o impagada (y la escalera del local)

import Stripe from 'https://esm.sh/stripe@16.12.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function fecha(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/** Deja el estado del local en función de la suscripción. */
async function estadoLocal(barberiaId: string, estado: string) {
  const map: Record<string, string> = {
    active: 'al_dia',
    trialing: 'al_dia',
    past_due: 'pendiente',
    unpaid: 'lectura',
    canceled: 'suspendido',
    incomplete_expired: 'suspendido',
  };
  const cobro = map[estado] ?? 'pendiente';
  const activo = cobro !== 'suspendido';

  await admin
    .from('barberias')
    .update({ estado_cobro: cobro, activo })
    .eq('id', barberiaId);
}

async function guardarSuscripcion(sus: any) {
  const barberiaId = sus.metadata?.barberia_id ?? null;
  if (!barberiaId) return;

  const item = sus.items?.data?.[0];
  const cantidad = item?.quantity ?? null;
  // El fin de periodo vive en la línea de la suscripción desde la API 2024.
  const fin = item?.current_period_end ?? sus.current_period_end ?? null;

  await admin.from('suscripciones').upsert({
    barberia_id: barberiaId,
    stripe_subscription_id: sus.id,
    stripe_customer_id: sus.customer,
    estado:
      sus.status === 'active' || sus.status === 'trialing'
        ? 'activa'
        : sus.status === 'past_due'
          ? 'impagada'
          : sus.status === 'paused'
            ? 'pausada'
            : sus.status === 'canceled'
              ? 'cancelada'
              : 'sin_activar',
    cantidad: cantidad ?? 0,
    periodo_fin: fecha(fin),
    actualizado_en: new Date().toISOString(),
  });

  await estadoLocal(barberiaId, sus.status);
}

async function crearSuscripcionDeAlta(sesion: any) {
  const barberiaId = sesion.metadata?.barberia_id;
  if (!barberiaId) return;

  const metodo = sesion.payment_intent
    ? (await stripe.paymentIntents.retrieve(sesion.payment_intent)).payment_method
    : null;

  const cliente = sesion.customer as string;

  // Si ya tenía una suscripción viva, no se duplica.
  const { data: existente } = await admin
    .from('suscripciones')
    .select('stripe_subscription_id')
    .eq('barberia_id', barberiaId)
    .maybeSingle();
  if (existente?.stripe_subscription_id) return;

  const sus = await stripe.subscriptions.create({
    customer: cliente,
    items: [
      {
        price: Deno.env.get('STRIPE_PRICE_CUOTA')!,
        quantity: Math.min(40, Math.max(15, Number(sesion.metadata?.cantidad ?? 15))),
      },
    ],
    default_payment_method: metodo ?? undefined,
    trial_period_days: 30,
    metadata: { barberia_id: barberiaId },
    default_tax_rates: [Deno.env.get('STRIPE_TAX_IVA')!],
  });

  await guardarSuscripcion(sus);
}

Deno.serve(async (req) => {
  const firma = req.headers.get('stripe-signature');
  const cuerpo = await req.text();

  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(
      cuerpo,
      firma!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (e) {
    return new Response(`firma inválida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        const sesion = evento.data.object as any;
        if (sesion.metadata?.tipo === 'alta') await crearSuscripcionDeAlta(sesion);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await guardarSuscripcion(evento.data.object as any);
        break;
      }
      case 'invoice.paid': {
        const factura = evento.data.object as any;
        const barberiaId = factura.subscription_details?.metadata?.barberia_id;
        if (barberiaId) await estadoLocal(barberiaId, 'active');
        break;
      }
      case 'invoice.payment_failed': {
        const factura = evento.data.object as any;
        const barberiaId = factura.subscription_details?.metadata?.barberia_id;
        if (barberiaId) await estadoLocal(barberiaId, 'past_due');
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ recibido: evento.type }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
