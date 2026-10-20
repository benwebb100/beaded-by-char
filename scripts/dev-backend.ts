// Local stand-in for the Supabase edge functions, for browser testing without any accounts.
// Real checkout/newsletter code and real SQL (PGlite, loaded with the GHL import); Stripe and email are
// faked. "Paying" happens instantly: the fake Stripe URL is the thank-you page, and the paid webhook
// runs straight away.  usage: node scripts/dev-backend.ts [port]   (then build the site with
// PUBLIC_CHECKOUT_ENDPOINT / PUBLIC_NEWSLETTER_ENDPOINT pointing here)
import { createServer } from 'node:http';
import { freshDb } from '../tests/helpers/pg.mjs';
import { buildRows } from './lib/ghl-rows.mjs';
import { createCheckout, handleStripeEvent, subscribe, type Deps } from '../supabase/functions/_shared/shop.ts';
import type { OrderForEmail } from '../supabase/functions/_shared/emails.ts';

const port = Number(process.argv[2] ?? 54321);
const SITE = process.env.SITE_URL ?? 'http://127.0.0.1:4321';
const db = await freshDb();

const rows = await buildRows();
for (const [table, data] of [['collections', rows.collections], ['products', rows.products], ['product_collections', rows.productCollections], ['prices', rows.prices]] as const) {
  for (const r of data as Record<string, unknown>[]) {
    const cols = Object.keys(r);
    await db.query(`insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map(c => (c === 'options' ? JSON.stringify(r[c]) : r[c])));
  }
}
await db.exec('set role service_role');

const rpc: Deps['rpc'] = async (fn, args) => {
  const names = Object.keys(args);
  const vals = names.map(n => (typeof args[n] === 'object' && args[n] !== null ? JSON.stringify(args[n]) : args[n]));
  try { return (await db.query<{ r: never }>(`select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`, vals)).rows[0].r; }
  catch (e) { throw new Error((e as Error).message); }
};
export const sent: string[] = [];
const deps: Deps = {
  env: { SITE_URL: SITE }, rpc,
  stripe: { checkout: { sessions: { create: async params => {
    const id = `cs_local_${Date.now()}`;
    const ship = params.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.amount ?? 0;
    const amount = (params.line_items ?? []).reduce((n, l) => n + (l.price_data?.unit_amount ?? 0) * (l.quantity ?? 1), 0) + ship;
    // Pretend the shopper paid: run the webhook as soon as Stripe would have redirected them.
    setTimeout(() => handleStripeEvent({ id: 'evt_local', type: 'checkout.session.completed', data: { object: {
      id, payment_status: 'paid', amount_total: amount, total_details: { amount_shipping: ship }, payment_intent: `pi_${id}`,
      customer_details: { name: 'Local Tester', email: 'tester@example.com', phone: '' },
      collected_information: { shipping_details: { name: 'Local Tester', address: { line1: '1 Test St', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' } } },
    } } } as never, deps).then(r => console.log('webhook:', r)), 50);
    return { id, url: params.success_url!.replace('{CHECKOUT_SESSION_ID}', id) };
  } } } },
  getOrder: async id => {
    const o = (await db.query<OrderForEmail>('select * from orders where id = $1', [id])).rows[0];
    const items = (await db.query<OrderForEmail['items'][number]>('select name, variant, image, unit_amount::float unit_amount, qty from order_items where order_id = $1', [id])).rows;
    return { ...o, subtotal: Number(o.subtotal), shipping: Number(o.shipping), total: Number(o.total), items };
  },
  notifyEmail: async () => 'info@beadedbychar.com.au',
  sendEmail: async e => { sent.push(e.subject); console.log('email:', e.subject, '->', e.to); },
  rebuildSite: async () => { console.log('rebuild requested'); },
  log: (...a) => console.error(...a),
};

createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  const send = (status: number, body: unknown) => res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'GET' && req.url === '/debug/orders') {
    send(200, { orders: (await db.query('select number, status, total::float, customer_email from orders order by number')).rows, emails: sent });
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const r = req.url === '/functions/v1/checkout' ? await createCheckout(body, deps)
    : req.url === '/functions/v1/newsletter' ? await subscribe(body, deps)
    : { status: 404, body: { error: 'not found' } };
  send(r.status, r.body);
}).listen(port, '127.0.0.1', () => console.log(`dev backend on http://127.0.0.1:${port}`));
