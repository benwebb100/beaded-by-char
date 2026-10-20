// Stripe calls this when a checkout is paid or expires, or a charge is refunded.
import Stripe from 'npm:stripe@23.0.0';
import { handleStripeEvent } from '../_shared/shop.ts';
import { deps, stripe } from '../_shared/runtime.ts';

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, req.headers.get('Stripe-Signature') ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, crypto);
  } catch (e) {
    console.error('bad signature', (e as Error).message);
    return new Response('Bad signature', { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event, deps());
    console.log(event.type, event.id, result);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error(event.type, event.id, e);
    return new Response('Webhook handler failed', { status: 500 });   // Stripe will retry
  }
});
