// Unit tests for the edge-function logic, with fake Supabase/Stripe/email clients.
// Node runs .ts directly (type stripping), so this imports the same files Deno deploys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { parseLines, checkoutError, sessionParams, createCheckout, sessionDetails, handleStripeEvent, subscribe, type Deps } from '../supabase/functions/_shared/shop.ts';
import { orderConfirmation, orderAlert, addressLines, type OrderForEmail } from '../supabase/functions/_shared/emails.ts';

const SITE = 'https://beadedbychar.com.au';
const pending = {
  order_id: 'ord-1', number: 1001, subtotal: 33.45, shipping: 15, shipping_label: 'Standard delivery', total: 48.45,
  items: [
    { name: 'Mini Candle', variant: 'Vanilla', image: '/img/p/abc-0.webp', unit_amount: 12.5, qty: 2 },
    { name: 'Pink Pug Pen', variant: '', image: null, unit_amount: 8.45, qty: 1 },
  ],
};
const order: OrderForEmail = {
  id: 'ord-1', number: 1001, created_at: '2026-10-20T00:00:00Z', customer_name: 'Jane <b>Citizen</b>', customer_email: 'jane@example.com',
  customer_phone: '0400 000 000', shipping_address: { name: 'Jane Citizen', line1: '1 Test St', line2: '', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' },
  subtotal: 33.45, shipping: 15, total: 48.45, items: pending.items,
};

function fakeDeps(over: Partial<Deps> = {}) {
  const calls = { rpc: [] as [string, Record<string, unknown>][], stripe: [] as unknown[], emails: [] as { to: string | string[]; subject: string }[], rebuilds: 0 };
  const deps: Deps = {
    env: { SITE_URL: SITE },
    rpc: async (fn, args) => { calls.rpc.push([fn, args]); return undefined as never; },
    stripe: { checkout: { sessions: { create: async (params, opts) => { calls.stripe.push({ params, opts }); return { id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' }; } } } },
    getOrder: async () => order,
    notifyEmail: async () => 'info@beadedbychar.com.au, charlee@example.com',
    sendEmail: async e => { calls.emails.push({ to: e.to, subject: e.subject }); },
    rebuildSite: async () => { calls.rebuilds++; },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

test('cart lines are validated before anything touches the database', () => {
  assert.deepEqual(parseLines({ lines: [{ priceId: 'pr1', qty: 2 }] }), [{ priceId: 'pr1', qty: 2 }]);
  for (const bad of [null, {}, { lines: [] }, { lines: [{ priceId: 'pr1', qty: 0 }] }, { lines: [{ priceId: 'pr1', qty: 1.5 }] }, { lines: [{ priceId: 5, qty: 1 }] }, { lines: [{ priceId: 'pr1', qty: 100 }] }]) {
    assert.equal(parseLines(bad), null, JSON.stringify(bad));
  }
});

test('database errors become friendly messages', () => {
  assert.match(checkoutError('OUT_OF_STOCK:Mini Candle:2').body.error as string, /only 2 of Mini Candle left/);
  assert.match(checkoutError('OUT_OF_STOCK:Mini Candle:0').body.error as string, /Mini Candle has just sold out/);
  assert.match(checkoutError('UNAVAILABLE:Corgi Pen').body.error as string, /Corgi Pen is no longer available/);
  assert.equal(checkoutError('SHOP_CLOSED').status, 409);
  assert.equal(checkoutError('EMPTY_CART').status, 400);
  assert.equal(checkoutError('connection reset').status, 500);
});

test('the Stripe session charges database prices in cents, ships to Australia only, and returns to the site', () => {
  const p = sessionParams(pending, { SITE_URL: SITE });
  assert.deepEqual(p.line_items!.map(l => [l.price_data!.unit_amount, l.quantity]), [[1250, 2], [845, 1]]);
  assert.equal(sessionParams({ ...pending, items: [{ ...pending.items[0], unit_amount: 20.95 }] }, { SITE_URL: SITE }).line_items![0].price_data!.unit_amount, 2095);
  assert.deepEqual(p.line_items![0].price_data!.product_data, { name: 'Mini Candle', description: 'Vanilla', images: [`${SITE}/img/p/abc-0.webp`] });
  assert.deepEqual(p.line_items![1].price_data!.product_data, { name: 'Pink Pug Pen' });
  assert.deepEqual(p.shipping_address_collection, { allowed_countries: ['AU'] });
  assert.equal(p.shipping_options![0].shipping_rate_data!.fixed_amount!.amount, 1500);
  assert.equal(p.success_url, `${SITE}/thank-you?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(p.cancel_url, `${SITE}/cart`);
  assert.equal(p.metadata!.order_id, 'ord-1');
  assert.ok(p.expires_at! - Date.now() / 1000 > 30 * 60);
});

test('checkout creates the order, opens a Stripe session for it and links the two', async () => {
  const { deps, calls } = fakeDeps({ rpc: async (fn, args) => { calls.rpc.push([fn, args]); return (fn === 'create_pending_order' ? pending : null) as never; } });
  const res = await createCheckout({ lines: [{ priceId: 'pr1', qty: 2 }, { priceId: 'pr9', qty: 1 }] }, deps);
  assert.deepEqual(res, { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/cs_test_123' } });
  assert.deepEqual(calls.rpc.map(c => c[0]), ['create_pending_order', 'attach_checkout_session']);
  assert.deepEqual(calls.rpc[1][1], { p_order: 'ord-1', p_session: 'cs_test_123' });
  assert.deepEqual((calls.stripe[0] as { opts: unknown }).opts, { idempotencyKey: 'order-ord-1' });
});

test('checkout stops before Stripe when the database says no', async () => {
  const { deps, calls } = fakeDeps({ rpc: async () => { throw new Error('OUT_OF_STOCK:Mini Candle:1'); } });
  const res = await createCheckout({ lines: [{ priceId: 'pr1', qty: 2 }] }, deps);
  assert.equal(res.status, 409);
  assert.equal(calls.stripe.length, 0);
  assert.equal((await createCheckout({ lines: 'nope' }, deps)).status, 400);
});

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_123', object: 'checkout.session', payment_status: 'paid', amount_total: 4845, total_details: { amount_shipping: 1500 },
  payment_intent: 'pi_123', customer_details: { name: 'Jane Citizen', email: 'jane@example.com', phone: '+61400000000' },
  collected_information: { shipping_details: { name: 'Jane Citizen', address: { line1: '1 Test St', line2: null, city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' } } },
  ...over,
});
const event = (type: string, object: unknown) => ({ id: 'evt_1', type, data: { object } }) as unknown as Stripe.Event;

test('session details read shipping from both the new and old Stripe API shapes', () => {
  const d = sessionDetails(session() as never);
  assert.deepEqual(d, {
    customer_name: 'Jane Citizen', customer_email: 'jane@example.com', customer_phone: '+61400000000',
    shipping_address: { name: 'Jane Citizen', line1: '1 Test St', line2: '', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' },
    total: 48.45, shipping: 15, payment_intent: 'pi_123',
  });
  const old = sessionDetails(session({ collected_information: null, shipping_details: { name: 'J', address: { line1: '2 Old Rd', city: 'Geelong', state: 'VIC', postal_code: '3220', country: 'AU' } } }) as never);
  assert.equal(old.shipping_address!.line1, '2 Old Rd');
});

test('a paid checkout records the order, emails the customer and Charlee, and rebuilds when stock runs out', async () => {
  const { deps, calls } = fakeDeps({ rpc: async (fn, args) => { calls.rpc.push([fn, args]); return { newly_paid: true, order_id: 'ord-1', number: 1001, sold_out: ['pr1'] } as never; } });
  const result = await handleStripeEvent(event('checkout.session.completed', session()), deps);
  assert.equal(result, 'order #1001 paid');
  assert.equal(calls.rpc[0][0], 'mark_order_paid');
  assert.equal((calls.rpc[0][1].p_details as { customer_email: string }).customer_email, 'jane@example.com');
  assert.deepEqual(calls.emails.map(e => [e.subject, e.to]).sort(), [
    ['New order #1001 · A$48.45', ['info@beadedbychar.com.au', 'charlee@example.com']],
    ['Your BeadedByChar order #1001', 'jane@example.com'],
  ]);
  assert.equal(calls.rebuilds, 1);
});

test('a repeated webhook sends nothing twice', async () => {
  const { deps, calls } = fakeDeps({ rpc: async () => ({ newly_paid: false, order_id: 'ord-1', number: 1001 }) as never });
  assert.equal(await handleStripeEvent(event('checkout.session.completed', session()), deps), 'already recorded');
  assert.equal(calls.emails.length, 0);
});

test('an email failure does not fail the webhook', async () => {
  const { deps } = fakeDeps({
    rpc: async () => ({ newly_paid: true, order_id: 'ord-1', number: 1001, sold_out: [] }) as never,
    sendEmail: async () => { throw new Error('Resend down'); },
  });
  assert.equal(await handleStripeEvent(event('checkout.session.completed', session()), deps), 'order #1001 paid');
});

test('unpaid, expired and refunded sessions are handled', async () => {
  const { deps, calls } = fakeDeps();
  assert.equal(await handleStripeEvent(event('checkout.session.completed', session({ payment_status: 'unpaid' })), deps), 'waiting for payment');
  await handleStripeEvent(event('checkout.session.expired', session({ payment_status: 'unpaid' })), deps);
  await handleStripeEvent(event('charge.refunded', { object: 'charge', payment_intent: 'pi_123', amount: 4845, amount_refunded: 1000 }), deps);
  await handleStripeEvent(event('charge.refunded', { object: 'charge', payment_intent: 'pi_123', amount: 4845, amount_refunded: 4845 }), deps);
  assert.deepEqual(calls.rpc, [
    ['cancel_pending_order', { p_session: 'cs_test_123' }],
    ['mark_order_refunded', { p_payment_intent: 'pi_123', p_full: false }],
    ['mark_order_refunded', { p_payment_intent: 'pi_123', p_full: true }],
  ]);
  assert.equal(await handleStripeEvent(event('customer.created', {}), deps), 'ignored');
});

test('Stripe-signed payloads verify with the SDK the webhook uses', async () => {
  const stripe = new Stripe('sk_test_dummy');
  const payload = JSON.stringify(event('checkout.session.completed', session()));
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
  const verified = await stripe.webhooks.constructEventAsync(payload, header, 'whsec_test');
  assert.equal(verified.type, 'checkout.session.completed');
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, header, 'whsec_wrong'));
});

test('newsletter sign-ups: honeypot, validation, and an alert only for new subscribers', async () => {
  let isNew = true;
  const { deps, calls } = fakeDeps({ rpc: async (fn, args) => { calls.rpc.push([fn, args]); return isNew as never; } });
  assert.deepEqual(await subscribe({ first_name: 'A', last_name: 'B', email: 'a@b.co', website: 'spam.biz' }, deps), { status: 200, body: { ok: true } });
  assert.equal(calls.rpc.length, 0);
  assert.equal((await subscribe({ first_name: 'A', last_name: '', email: 'a@b.co' }, deps)).status, 400);
  assert.equal((await subscribe({ first_name: 'A', last_name: 'B', email: 'nope' }, deps)).status, 400);
  assert.equal((await subscribe({ first_name: ' Amy ', last_name: 'Lee', email: 'amy@example.com' }, deps)).status, 200);
  assert.deepEqual(calls.rpc[0], ['subscribe_newsletter', { p_first: 'Amy', p_last: 'Lee', p_email: 'amy@example.com' }]);
  assert.equal(calls.emails.length, 1);
  isNew = false;
  await subscribe({ first_name: 'Amy', last_name: 'Lee', email: 'amy@example.com' }, deps);
  assert.equal(calls.emails.length, 1);
});

test('emails escape customer-entered text and format the address', () => {
  const c = orderConfirmation(order, 'info@beadedbychar.com.au', SITE);
  assert.equal(c.to, 'jane@example.com');
  assert.equal(c.subject, 'Your BeadedByChar order #1001');
  assert.ok(!c.html.includes('<b>Citizen</b>'));
  assert.ok(c.html.includes('Thanks for your order, Jane!'));
  assert.ok(c.html.includes('A$25.00') && c.html.includes('A$48.45'));
  assert.ok(c.html.includes(`${SITE}/img/p/abc-0.webp`));
  assert.equal(c.replyTo, 'info@beadedbychar.com.au');
  assert.equal(orderConfirmation(order, 'info@beadedbychar.com.au, charlee@example.com', SITE).replyTo, 'info@beadedbychar.com.au');
  assert.deepEqual(orderAlert(order, ' info@beadedbychar.com.au ;charlee@example.com,, nonsense ', SITE).to, ['info@beadedbychar.com.au', 'charlee@example.com']);
  assert.deepEqual(orderAlert(order, '', SITE).to, ['info@beadedbychar.com.au']);
  const a = orderAlert({ ...order, oversold: true }, 'info@beadedbychar.com.au', SITE);
  assert.ok(a.html.includes(`${SITE}/admin/#/orders/ord-1`));
  assert.ok(a.html.includes('more of an item than you had in stock'));
  assert.equal(a.replyTo, 'jane@example.com');
  assert.deepEqual(addressLines(order.shipping_address), ['Jane Citizen', '1 Test St', 'Melbourne VIC 3000']);
});
