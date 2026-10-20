// The whole order flow against the real schema: the edge-function code calls the real Postgres
// functions (in PGlite), with only Stripe and email faked. Catches mismatched argument names and shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers/pg.mjs';
import { createCheckout, handleStripeEvent, subscribe, type Deps } from '../supabase/functions/_shared/shop.ts';
import type { OrderForEmail } from '../supabase/functions/_shared/emails.ts';

test('cart → Stripe session → payment webhook → paid order, stock taken, emails out', async () => {
  const db = await freshDb();
  await db.exec(`
    insert into products (id, name, images, options) values
      ('p1', 'Mini Candle', '{/img/p/p1-0.webp}', '[{"id":"o1","name":"Scent","values":[{"id":"v1","name":"Vanilla"}]}]'),
      ('p2', 'Corgi Pen', '{}', '[]');
    insert into prices (id, product_id, option_value_ids, amount, track_inventory, quantity) values
      ('pr1', 'p1', '{v1}', 12.50, true, 2), ('pr2', 'p2', '{}', 11.95, false, null);
  `);
  await db.exec('set role service_role');

  const rpc: Deps['rpc'] = async (fn, args) => {
    const names = Object.keys(args);
    const sql = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
    const vals = names.map(n => (typeof args[n] === 'object' && args[n] !== null ? JSON.stringify(args[n]) : args[n]));
    try { return (await db.query<{ r: never }>(sql, vals)).rows[0].r; }
    catch (e) { throw new Error((e as Error).message); }
  };
  const sessions: { params: unknown }[] = [];
  const emails: { to: string | string[]; subject: string }[] = [];
  let rebuilds = 0;
  const deps: Deps = {
    env: { SITE_URL: 'https://beadedbychar.com.au' }, rpc,
    stripe: { checkout: { sessions: { create: async params => { sessions.push({ params }); return { id: 'cs_test_flow', url: 'https://checkout.stripe.com/c/pay/cs_test_flow' }; } } } },
    getOrder: async id => {
      const o = (await db.query<OrderForEmail>('select * from orders where id = $1', [id])).rows[0];
      const items = (await db.query<OrderForEmail['items'][number]>('select name, variant, image, unit_amount::float as unit_amount, qty from order_items where order_id = $1', [id])).rows;
      return { ...o, subtotal: Number(o.subtotal), shipping: Number(o.shipping), total: Number(o.total), items };
    },
    notifyEmail: async () => (await db.query<{ notify_email: string }>('select notify_email from settings')).rows[0].notify_email,
    sendEmail: async e => { emails.push({ to: e.to, subject: e.subject }); },
    rebuildSite: async () => { rebuilds++; },
    log: () => {},
  };

  // A tampered cart amount is irrelevant: only price ids and quantities are sent, and the database prices them.
  const res = await createCheckout({ lines: [{ priceId: 'pr1', qty: 2 }, { priceId: 'pr2', qty: 1 }] }, deps);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const params = sessions[0].params as { line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string; description?: string } } }[] };
  assert.deepEqual(params.line_items.map(l => [l.price_data.product_data.name, l.price_data.product_data.description, l.price_data.unit_amount, l.quantity]),
    [['Corgi Pen', undefined, 1195, 1], ['Mini Candle', 'Vanilla', 1250, 2]]);

  const tooMany = await createCheckout({ lines: [{ priceId: 'pr1', qty: 3 }] }, deps);
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.body.error as string, /only 2 of Mini Candle left/);

  const completed = { id: 'evt_1', type: 'checkout.session.completed', data: { object: {
    id: 'cs_test_flow', payment_status: 'paid', amount_total: 5195, total_details: { amount_shipping: 1500 }, payment_intent: 'pi_flow',
    customer_details: { name: 'Sample Customer', email: 'sample@example.com', phone: '+61400000000' },
    collected_information: { shipping_details: { name: 'Sample Customer', address: { line1: '1 Sample St', line2: null, city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' } } },
  } } } as never;
  assert.equal(await handleStripeEvent(completed, deps), 'order #1001 paid');
  assert.equal(await handleStripeEvent(completed, deps), 'already recorded');
  assert.deepEqual(emails.map(e => e.subject).sort(), ['New order #1001 · A$51.95', 'Your BeadedByChar order #1001']);
  assert.equal(rebuilds, 1, 'candle sold out, so the site rebuilds');

  const o = (await db.query<{ status: string; total: string; customer_email: string }>(`select status, total, customer_email from orders where number = 1001`)).rows[0];
  assert.deepEqual({ ...o, total: Number(o.total) }, { status: 'paid', total: 51.95, customer_email: 'sample@example.com' });
  assert.equal((await db.query<{ quantity: number }>(`select quantity from prices where id = 'pr1'`)).rows[0].quantity, 0);

  await handleStripeEvent({ id: 'evt_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_flow', amount: 5195, amount_refunded: 5195 } } } as never, deps);
  assert.equal((await db.query<{ status: string }>(`select status from orders where number = 1001`)).rows[0].status, 'refunded');

  assert.equal((await subscribe({ first_name: 'Amy', last_name: 'Lee', email: 'amy@example.com' }, deps)).status, 200);
  assert.equal((await db.query<{ newsletter: boolean }>(`select newsletter from contacts where email = 'amy@example.com'`)).rows[0].newsletter, true);
  assert.equal(emails.at(-1)!.subject, 'New newsletter sign-up: Amy Lee');
});
