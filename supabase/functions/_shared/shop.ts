// Checkout, Stripe webhook and newsletter logic, free of Deno/Supabase specifics so it can be
// unit-tested in Node. The edge function entry points wire in the real clients.
import type Stripe from 'npm:stripe@23.0.0';
import { orderConfirmation, orderAlert, newsletterAlert, type OrderForEmail, type Email } from './emails.ts';

export type Env = { SITE_URL: string };

export type Deps = {
  env: Env;
  /** Calls a Postgres function; throws an Error carrying Postgres's message on failure. */
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
  stripe: {
    checkout: { sessions: { create(params: Stripe.Checkout.SessionCreateParams, opts?: { idempotencyKey?: string }): Promise<{ id: string; url: string | null }> } };
  };
  getOrder: (id: string) => Promise<OrderForEmail>;
  notifyEmail: () => Promise<string>;
  sendEmail: (email: Email) => Promise<void>;
  rebuildSite: () => Promise<void>;
  log: (...args: unknown[]) => void;
};

export type Result = { status: number; body: Record<string, unknown> };

type PendingOrder = {
  order_id: string;
  number: number;
  subtotal: number;
  shipping: number;
  shipping_label: string;
  total: number;
  items: { name: string; variant: string; image: string | null; unit_amount: number; qty: number }[];
};

const cents = (n: number | string) => Math.round(Number(n) * 100);

export function parseLines(body: unknown): { priceId: string; qty: number }[] | null {
  const lines = (body as { lines?: unknown })?.lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) return null;
  const out = [];
  for (const l of lines) {
    const priceId = (l as { priceId?: unknown })?.priceId;
    const qty = (l as { qty?: unknown })?.qty;
    if (typeof priceId !== 'string' || priceId.length > 64 || !Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > 99) return null;
    out.push({ priceId, qty: qty as number });
  }
  return out;
}

/** Turns the Postgres exceptions raised by create_pending_order into messages for shoppers. */
export function checkoutError(message: string): Result {
  const [code, name, left] = message.split(':');
  switch (code) {
    case 'SHOP_CLOSED': return { status: 409, body: { error: "The shop isn't taking orders right now. Please check back soon." } };
    case 'OUT_OF_STOCK':
      return { status: 409, body: { error: Number(left) > 0 ? `Sorry, only ${left} of ${name} left. Please lower the quantity.` : `Sorry, ${name} has just sold out.` } };
    case 'UNAVAILABLE': return { status: 409, body: { error: `Sorry, ${name} is no longer available. Please remove it from your cart.` } };
    case 'BAD_LINE':
    case 'EMPTY_CART': return { status: 400, body: { error: 'Your cart looks empty or out of date. Please refresh and try again.' } };
    default: return { status: 500, body: { error: 'Checkout failed. Please try again.' } };
  }
}

export function sessionParams(order: PendingOrder, env: Env): Stripe.Checkout.SessionCreateParams {
  const abs = (src: string) => (src.startsWith('http') ? src : env.SITE_URL + src);
  return {
    mode: 'payment',
    currency: 'aud',
    line_items: order.items.map(i => ({
      quantity: i.qty,
      price_data: {
        currency: 'aud',
        unit_amount: cents(i.unit_amount),
        product_data: {
          name: i.name,
          ...(i.variant ? { description: i.variant } : {}),
          ...(i.image ? { images: [abs(i.image)] } : {}),
        },
      },
    })),
    shipping_address_collection: { allowed_countries: ['AU'] },
    shipping_options: [{
      shipping_rate_data: { type: 'fixed_amount', display_name: order.shipping_label, fixed_amount: { amount: cents(order.shipping), currency: 'aud' } },
    }],
    phone_number_collection: { enabled: true },
    client_reference_id: order.order_id,
    metadata: { order_id: order.order_id, order_number: String(order.number) },
    payment_intent_data: {
      description: `BeadedByChar order #${order.number}`,
      metadata: { order_id: order.order_id, order_number: String(order.number) },
    },
    success_url: `${env.SITE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.SITE_URL}/cart`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  };
}

export async function createCheckout(body: unknown, deps: Deps): Promise<Result> {
  const lines = parseLines(body);
  if (!lines) return { status: 400, body: { error: 'Your cart looks empty or out of date. Please refresh and try again.' } };
  let order: PendingOrder;
  try {
    order = await deps.rpc<PendingOrder>('create_pending_order', { p_lines: lines });
  } catch (e) {
    const res = checkoutError((e as Error).message);
    if (res.status === 500) deps.log('create_pending_order failed', e);
    return res;
  }
  const session = await deps.stripe.checkout.sessions.create(sessionParams(order, deps.env), { idempotencyKey: `order-${order.order_id}` });
  await deps.rpc('attach_checkout_session', { p_order: order.order_id, p_session: session.id });
  return { status: 200, body: { url: session.url } };
}

type Session = Stripe.Checkout.Session & {
  // Older API versions put shipping here; newer ones under collected_information.
  shipping_details?: { name?: string | null; address?: Stripe.Address | null } | null;
};

/** What mark_order_paid needs from a completed Checkout Session. */
export function sessionDetails(s: Session) {
  const ship = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
  const a = ship?.address;
  return {
    customer_name: s.customer_details?.name || ship?.name || '',
    customer_email: s.customer_details?.email ?? '',
    customer_phone: s.customer_details?.phone ?? '',
    shipping_address: a ? { name: ship?.name ?? '', line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', state: a.state ?? '', postal_code: a.postal_code ?? '', country: a.country ?? '' } : null,
    total: (s.amount_total ?? 0) / 100,
    shipping: (s.total_details?.amount_shipping ?? s.shipping_cost?.amount_total ?? 0) / 100,
    payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? '',
  };
}

type Paid = { newly_paid: boolean; order_id: string; number: number; sold_out?: string[]; oversold?: boolean };

export async function handleStripeEvent(event: Stripe.Event, deps: Deps): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Session;
      if (s.payment_status !== 'paid') return 'waiting for payment';
      const paid = await deps.rpc<Paid>('mark_order_paid', { p_session: s.id, p_details: sessionDetails(s) });
      if (!paid?.order_id) return 'no matching order';
      if (!paid.newly_paid) return 'already recorded';

      const order = await deps.getOrder(paid.order_id);
      const notify = await deps.notifyEmail();
      const sends = [deps.sendEmail(orderAlert(order, notify, deps.env.SITE_URL))];
      if (order.customer_email) sends.unshift(deps.sendEmail(orderConfirmation(order, notify, deps.env.SITE_URL)));
      for (const r of await Promise.allSettled(sends)) if (r.status === 'rejected') deps.log('email failed', r.reason);
      if (paid.sold_out?.length) await deps.rebuildSite().catch(e => deps.log('rebuild failed', e));
      return `order #${paid.number} paid`;
    }
    case 'checkout.session.expired':
      await deps.rpc('cancel_pending_order', { p_session: (event.data.object as Session).id });
      return 'cancelled';
    case 'charge.refunded': {
      const c = event.data.object as Stripe.Charge;
      const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
      if (pi) await deps.rpc('mark_order_refunded', { p_payment_intent: pi, p_full: c.amount_refunded >= c.amount });
      return 'refund recorded';
    }
    default:
      return 'ignored';
  }
}

export async function subscribe(body: unknown, deps: Deps): Promise<Result> {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (str(b.website)) return { status: 200, body: { ok: true } };   // honeypot field: bots fill it in
  const first = str(b.first_name).slice(0, 80), last = str(b.last_name).slice(0, 80), email = str(b.email).slice(0, 254);
  if (!first || !last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, body: { error: 'Please fill in your name and a valid email.' } };
  try {
    const isNew = await deps.rpc<boolean>('subscribe_newsletter', { p_first: first, p_last: last, p_email: email });
    if (isNew) await deps.sendEmail(newsletterAlert({ first, last, email }, await deps.notifyEmail(), deps.env.SITE_URL)).catch(e => deps.log('email failed', e));
    return { status: 200, body: { ok: true } };
  } catch (e) {
    deps.log('subscribe failed', e);
    return { status: (e as Error).message.includes('BAD_EMAIL') ? 400 : 500, body: { error: 'Something went wrong. Please try again.' } };
  }
}
