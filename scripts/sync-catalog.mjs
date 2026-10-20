// Runs before every build. When Supabase is configured, pulls the visible catalogue into
// src/data/catalog.json (same shape the pages already read). Otherwise leaves the file as is.
import { readFile, writeFile } from 'node:fs/promises';
import { headers } from './lib/supabase-rest.mjs';

const url = process.env.PUBLIC_SUPABASE_URL, key = process.env.PUBLIC_SUPABASE_ANON_KEY;
const file = 'src/data/catalog.json';
if (!url || !key) {
  console.log('sync-catalog: no Supabase configured, using the committed catalogue');
  process.exit(0);
}

async function get(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers(key) });
  if (!res.ok) throw new Error(`sync-catalog: ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const current = JSON.parse(await readFile(file, 'utf8'));
const [collections, products] = await Promise.all([
  get('collections?select=id,name,slug,image,sort&order=sort,name'),
  get('products?select=id,name,description,visible,images,options,prices(*),product_collections(collection_id)&visible=eq.true&order=name'),
]);

const out = {
  collections: collections.map(c => ({ ...c, image: c.image ?? current.site.tiles[c.slug] ?? null })),
  products: products.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    collectionIds: p.product_collections.map(x => x.collection_id),
    available: p.visible,
    images: p.images,
    options: p.options,
    prices: p.prices.filter(x => x.active).map(x => ({
      id: x.id, optionValueIds: x.option_value_ids, amount: Number(x.amount), compareAt: x.compare_at === null ? null : Number(x.compare_at),
      trackInventory: x.track_inventory, quantity: x.quantity, allowOutOfStock: x.allow_out_of_stock,
    })),
  })).sort((a, b) => a.name.localeCompare(b.name)),
  site: current.site,
};
await writeFile(file, JSON.stringify(out, null, 1));
console.log(`sync-catalog: ${out.products.length} products, ${out.collections.length} collections from Supabase`);
