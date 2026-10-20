// Loads the GHL import rows into the real schema (PGlite) to prove they fit the constraints.
// Skips when the local GHL pull (discovery/, gitignored) isn't present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { freshDb } from './helpers/pg.mjs';
import { buildRows } from '../scripts/lib/ghl-rows.mjs';

const have = await access('discovery/ghl/contacts_all.json').then(() => true, () => false);

test('GHL data imports cleanly into the schema', { skip: !have && 'no local GHL pull' }, async () => {
  const db = await freshDb();

  const rows = await buildRows();
  const insert = async (table, data) => {
    for (const r of data) {
      const cols = Object.keys(r);
      await db.query(`insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        cols.map(c => (Array.isArray(r[c]) && c !== 'options' ? r[c] : r[c] !== null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])));
    }
  };
  await insert('collections', rows.collections);
  await insert('products', rows.products);
  await insert('product_collections', rows.productCollections);
  await insert('prices', rows.prices);
  await insert('orders', rows.orders);
  await insert('order_items', rows.orderItems);
  await insert('contacts', rows.contacts);

  const n = async t => (await db.query(`select count(*)::int n from ${t}`)).rows[0].n;
  assert.equal(await n('products'), 48);
  assert.equal(await n('collections'), 10);
  assert.equal(await n('orders'), 89);                       // 90 minus the one test-mode order
  assert.equal(await n('contacts'), rows.contacts.length);
  const paid = (await db.query(`select count(*)::int n, sum(total)::float t from orders where status = 'paid'`)).rows[0];
  assert.equal(paid.n, 77);
  assert.ok(paid.t > 3000, `paid total ${paid.t}`);
  const unf = (await db.query(`select count(*)::int n from orders where status = 'paid' and fulfillment = 'unfulfilled'`)).rows[0].n;
  console.log(`  paid orders ${paid.n} (A$${paid.t.toFixed(2)}), unfulfilled ${unf}, contacts ${rows.contacts.length}, newsletter ${rows.contacts.filter(c => c.newsletter).length}`);
  // Orders add up: items + shipping - discount = total.
  const off = (await db.query(`
    select o.number from orders o join (select order_id, sum(unit_amount * qty) s from order_items group by order_id) i on i.order_id = o.id
    where o.status = 'paid' and abs(i.s + o.shipping - o.discount - o.total) > 0.01`)).rows;
  assert.deepEqual(off, [], `orders whose items don't add up: ${off.map(r => r.number)}`);
  // New orders still number from 1001.
  await db.exec(`set role service_role`);
  const [{ o }] = (await db.query(`select create_pending_order('[{"priceId":"${rows.prices.find(p => !p.track_inventory).id}","qty":1}]') o`)).rows;
  assert.equal(o.number, 1001);
});
