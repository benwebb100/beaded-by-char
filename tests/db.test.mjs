// Runs the Supabase migration in an in-memory Postgres (PGlite) with stand-ins for the
// auth and storage schemas, then checks the security rules and the order/stock functions.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers/pg.mjs';

let db;
const ADMIN = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

// Run `fn` as a Supabase API role. `sub` is the signed-in user id, if any.
async function as(role, fn, sub = null) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const rejects = (p, re) => assert.rejects(p, e => re.test(e.message));

before(async () => {
  db = await freshDb();
  await db.exec(`
    insert into auth.users values ('${ADMIN}', 'char@example.com'), ('${STRANGER}', 'someone@example.com');
    insert into public.admins (user_id, email) values ('${ADMIN}', 'char@example.com');
    insert into public.collections (id, name, slug) values ('c1', 'Candles', 'candles');
    insert into public.products (id, name, options) values
      ('p1', 'Mini Candle', '[{"id":"o1","name":"Scent","values":[{"id":"v1","name":"Vanilla"},{"id":"v2","name":"Lychee"}]}]'),
      ('p2', 'Hidden Pen', '[]'),
      ('p3', 'Keychain', '[]');
    update public.products set visible = false where id = 'p2';
    insert into public.product_collections values ('p1', 'c1');
    insert into public.prices (id, product_id, option_value_ids, amount, track_inventory, quantity) values
      ('pr1', 'p1', '{v1}', 12.50, true, 3),
      ('pr2', 'p1', '{v2}', 12.50, true, 0),
      ('pr3', 'p2', '{}', 9.95, false, null),
      ('pr4', 'p3', '{}', 6.99, false, null);
  `);
});

test('shoppers see visible products and live prices only', async () => {
  await as('anon', async () => {
    assert.deepEqual((await rows('select id from products order by id')).map(r => r.id), ['p1', 'p3']);
    assert.deepEqual((await rows('select id from prices order by id')).map(r => r.id), ['pr1', 'pr2', 'pr4']);
    assert.equal((await rows('select count(*)::int n from collections'))[0].n, 1);
  });
});

test('shoppers cannot read orders or contacts, or write anything', async () => {
  await as('anon', async () => {
    assert.equal((await rows('select count(*)::int n from orders'))[0].n, 0);
    assert.equal((await rows('select count(*)::int n from contacts'))[0].n, 0);
    await rejects(db.query(`insert into products (name) values ('x')`), /permission denied/);
    await rejects(db.query(`update prices set amount = 0`), /permission denied/);
    await rejects(db.query(`select notify_email from settings`), /permission denied/);
    assert.equal((await rows('select shop_open, shipping_amount from settings'))[0].shop_open, true);
  });
});

test('shoppers and non-admins cannot call the order functions', async () => {
  await as('anon', () => rejects(db.query(`select create_pending_order('[{"priceId":"pr4","qty":1}]')`), /permission denied/));
  await as('authenticated', () => rejects(db.query(`select mark_order_paid('x', '{}')`), /permission denied/), STRANGER);
});

test('a signed-in non-admin gets nothing extra', async () => {
  await as('authenticated', async () => {
    assert.deepEqual((await rows('select id from products order by id')).map(r => r.id), ['p1', 'p3']);
    await rejects(db.query(`update products set name = 'x' where id = 'p1'`).then(r => { if (r.affectedRows === 0) throw new Error('permission denied (no rows)'); }), /permission denied/);
  }, STRANGER);
});

test('a pending order is priced from the database, not the cart', async () => {
  const [{ o }] = await as('service_role', () => rows(`select create_pending_order('[{"priceId":"pr1","qty":2},{"priceId":"pr4","qty":1}]') o`));
  assert.equal(Number(o.subtotal), 31.99);
  assert.equal(Number(o.shipping), 15);
  assert.equal(Number(o.total), 46.99);
  assert.ok(o.number >= 1001);
  assert.deepEqual(o.items.map(i => [i.name, i.variant, i.qty]), [['Keychain', '', 1], ['Mini Candle', 'Vanilla', 2]]);
});

test('checkout refuses sold-out, hidden, unknown and silly lines', async () => {
  await as('service_role', async () => {
    await rejects(db.query(`select create_pending_order('[{"priceId":"pr2","qty":1}]')`), /OUT_OF_STOCK:Mini Candle:0/);
    await rejects(db.query(`select create_pending_order('[{"priceId":"pr1","qty":4}]')`), /OUT_OF_STOCK:Mini Candle:3/);
    await rejects(db.query(`select create_pending_order('[{"priceId":"pr1","qty":2},{"priceId":"pr1","qty":2}]')`), /OUT_OF_STOCK/);
    await rejects(db.query(`select create_pending_order('[{"priceId":"pr3","qty":1}]')`), /UNAVAILABLE:Hidden Pen/);
    await rejects(db.query(`select create_pending_order('[{"priceId":"nope","qty":1}]')`), /UNAVAILABLE/);
    await rejects(db.query(`select create_pending_order('[{"priceId":"pr4","qty":0}]')`), /BAD_LINE/);
    await rejects(db.query(`select create_pending_order('[]')`), /EMPTY_CART/);
  });
});

test('closing the shop stops checkout', async () => {
  await db.exec('update settings set shop_open = false');
  await as('service_role', () => rejects(db.query(`select create_pending_order('[{"priceId":"pr4","qty":1}]')`), /SHOP_CLOSED/));
  await db.exec('update settings set shop_open = true');
});

test('payment marks the order paid once, takes stock and records the customer', async () => {
  await as('service_role', async () => {
    const [{ o }] = await rows(`select create_pending_order('[{"priceId":"pr1","qty":3}]') o`);
    await db.query('select attach_checkout_session($1, $2)', [o.order_id, 'cs_test_1']);
    const details = { customer_name: 'Jane Q Citizen', customer_email: 'Jane@Example.com', customer_phone: '0400000000',
      shipping_address: { line1: '1 Test St', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' },
      total: 52.5, shipping: 15, payment_intent: 'pi_1' };
    const [{ r }] = await rows(`select mark_order_paid('cs_test_1', $1) r`, [details]);
    assert.equal(r.newly_paid, true);
    assert.deepEqual(r.sold_out, ['pr1']);
    assert.equal(r.oversold, false);
    assert.equal((await rows(`select quantity from prices where id = 'pr1'`))[0].quantity, 0);

    const [again] = (await rows(`select mark_order_paid('cs_test_1', $1) r`, [details])).map(x => x.r);
    assert.equal(again.newly_paid, false);
    assert.equal((await rows(`select quantity from prices where id = 'pr1'`))[0].quantity, 0);

    const [order] = await rows(`select status, customer_email, shipping_address->>'city' city, stripe_payment_intent from orders where id = $1`, [o.order_id]);
    assert.deepEqual(order, { status: 'paid', customer_email: 'Jane@Example.com', city: 'Melbourne', stripe_payment_intent: 'pi_1' });
    const [c] = await rows(`select first_name, last_name, phone, source from contacts where lower(email) = 'jane@example.com'`);
    assert.deepEqual(c, { first_name: 'Jane', last_name: 'Q Citizen', phone: '0400000000', source: 'order' });
  });
});

test('selling more than is left flags the order and floors stock at zero', async () => {
  await db.exec(`update prices set quantity = 1 where id = 'pr1'`);
  await as('service_role', async () => {
    const [{ o }] = await rows(`select create_pending_order('[{"priceId":"pr1","qty":1}]') o`);
    await db.query('select attach_checkout_session($1, $2)', [o.order_id, 'cs_race']);
    await db.exec(`update prices set quantity = 0 where id = 'pr1'`);   // someone else bought it meanwhile
    const [{ r }] = await rows(`select mark_order_paid('cs_race', '{"customer_email":"b@example.com","customer_name":"B"}') r`);
    assert.equal(r.oversold, true);
    assert.equal((await rows(`select oversold from orders where id = $1`, [o.order_id]))[0].oversold, true);
    assert.equal((await rows(`select quantity from prices where id = 'pr1'`))[0].quantity, 0);
  });
});

test('expired checkouts are cancelled; refunds are recorded', async () => {
  await as('service_role', async () => {
    const [{ o }] = await rows(`select create_pending_order('[{"priceId":"pr4","qty":1}]') o`);
    await db.query('select attach_checkout_session($1, $2)', [o.order_id, 'cs_expire']);
    await db.query(`select cancel_pending_order('cs_expire')`);
    assert.equal((await rows('select status from orders where id = $1', [o.order_id]))[0].status, 'cancelled');
    await db.query(`select mark_order_refunded('pi_1', false)`);
    assert.equal((await rows(`select status from orders where stripe_payment_intent = 'pi_1'`))[0].status, 'partially_refunded');
    await db.query(`select mark_order_refunded('pi_1', true)`);
    assert.equal((await rows(`select status from orders where stripe_payment_intent = 'pi_1'`))[0].status, 'refunded');
  });
});

test('the admin can see orders and change fulfilment and notes, but not amounts', async () => {
  await as('authenticated', async () => {
    assert.ok((await rows('select count(*)::int n from orders'))[0].n >= 3);
    const [o] = await rows(`select id from orders where status = 'refunded'`);
    await db.query(`update orders set fulfillment = 'fulfilled', note = 'posted Tue' where id = $1`, [o.id]);
    const [after] = await rows('select fulfillment, note, fulfilled_at is not null as stamped from orders where id = $1', [o.id]);
    assert.deepEqual(after, { fulfillment: 'fulfilled', note: 'posted Tue', stamped: true });
    await rejects(db.query(`update orders set total = 0 where id = $1`, [o.id]), /permission denied/);
    await rejects(db.query(`delete from orders where id = $1`, [o.id]), /permission denied/);
    assert.ok((await rows('select count(*)::int n from contacts'))[0].n >= 1);
    assert.equal((await rows('select notify_email from settings'))[0].notify_email, 'info@beadedbychar.com.au');
  }, ADMIN);
});

test('the admin can manage the catalogue, including hidden products, and edits mark the site stale', async () => {
  const before = (await rows('select catalog_changed_at from settings'))[0].catalog_changed_at;
  await as('authenticated', async () => {
    assert.deepEqual((await rows('select id from products order by id')).map(r => r.id), ['p1', 'p2', 'p3']);
    await db.query(`update prices set quantity = 5 where id = 'pr2'`);
    await db.query(`insert into products (name) values ('New Thing')`);
  }, ADMIN);
  const after = (await rows('select catalog_changed_at from settings'))[0].catalog_changed_at;
  assert.ok(after > before);
});

test('newsletter sign-ups upsert by email, case-insensitively', async () => {
  await as('service_role', async () => {
    assert.equal((await rows(`select subscribe_newsletter('Amy', 'Lee', 'amy@example.com') r`))[0].r, true);
    assert.equal((await rows(`select subscribe_newsletter('Amy', 'Lee', 'AMY@example.com') r`))[0].r, false);
    assert.equal((await rows(`select subscribe_newsletter('Jane', '', 'jane@example.com') r`))[0].r, true);   // customer, now subscribed
    assert.equal((await rows(`select newsletter from contacts where lower(email) = 'jane@example.com'`))[0].newsletter, true);
    await rejects(db.query(`select subscribe_newsletter('x', 'y', 'not-an-email')`), /BAD_EMAIL/);
  });
});

test('variant labels follow the option order', async () => {
  const [{ l }] = await rows(`select variant_label('[{"id":"a","name":"Colour","values":[{"id":"blue","name":"Blue"}]},{"id":"b","name":"Scent","values":[{"id":"van","name":"Vanilla"}]}]', '{van,blue}') l`);
  assert.equal(l, 'Blue / Vanilla');
});
