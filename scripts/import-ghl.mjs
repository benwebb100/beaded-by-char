// One-off: copy the catalogue, past orders and contacts from the GHL pull into Supabase.
// Safe to re-run: rows are upserted by id. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// usage: node --env-file=.env scripts/import-ghl.mjs [--dry-run]
import { buildRows } from './lib/ghl-rows.mjs';
import { headers } from './lib/supabase-rest.mjs';

const dry = process.argv.includes('--dry-run');
const rows = await buildRows();
for (const [k, v] of Object.entries(rows)) console.log(`${k.padEnd(20)} ${v.length}`);
if (dry) process.exit(0);

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');

// The import overwrites products by id, so it must not run again once Charlee is editing in the admin.
const check = await fetch(`${url}/rest/v1/orders?select=id&source=eq.website&limit=1`, { headers: headers(key) });
if (!check.ok) throw new Error(`Supabase rejected the key: ${check.status} ${await check.text()}`);
const existing = await check.json();
if (existing.length && !process.argv.includes('--force')) throw new Error('The shop already has website orders. Re-importing would overwrite catalogue edits; pass --force if you really mean it.');

async function upsert(table, data, onConflict = 'id') {
  for (let i = 0; i < data.length; i += 200) {
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...headers(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(data.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  }
  console.log(`✓ ${table}`);
}

await upsert('collections', rows.collections);
await upsert('products', rows.products);
await upsert('product_collections', rows.productCollections, 'product_id,collection_id');
await upsert('prices', rows.prices);
await upsert('orders', rows.orders);
await upsert('order_items', rows.orderItems);
await upsert('contacts', rows.contacts);
console.log('Import complete.');
