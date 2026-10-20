// Nightly backup: every shop table as JSON in backup/. Run by .github/workflows/backup.yml.
// usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { getAll } from './lib/supabase-rest.mjs';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
await mkdir('backup', { recursive: true });
for (const t of ['orders', 'order_items', 'contacts', 'products', 'prices', 'collections', 'product_collections', 'settings', 'admins']) {
  const rows = await getAll(url, key, `${t}?select=*`);
  await writeFile(`backup/${t}.json`, JSON.stringify(rows, null, 1));
  console.log(`${t.padEnd(20)} ${rows.length}`);
}
