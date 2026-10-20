// Turns the pulled GHL data (discovery/ghl) and the site catalogue (src/data/catalog.json)
// into rows for the Supabase tables. Pure: reads files, returns arrays.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const json = async p => JSON.parse(await readFile(p, 'utf8'));

/** Stable UUID from a GHL id, so re-running the import updates rows instead of duplicating them. */
export function uuidFrom(s) {
  const h = createHash('sha1').update(`bbc:${s}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const TILE_ORDER = ['keychains', 'pens', 'scrunchies', 'car-diffuser', 'mystery', 'hair-claws', 'tiktok', 'room-sprays', 'tumblers', 'candles'];
const money = n => Math.round(Number(n ?? 0) * 100) / 100;

export async function buildRows(root = '.') {
  const catalog = await json(`${root}/src/data/catalog.json`);
  const ghl = `${root}/discovery/ghl`;

  const collections = catalog.collections.map(c => ({
    id: c.id, name: c.name, slug: c.slug,
    image: catalog.site.tiles[c.slug] ?? null,
    sort: TILE_ORDER.includes(c.slug) ? TILE_ORDER.indexOf(c.slug) : 100,
  }));

  const products = catalog.products.map(p => ({
    id: p.id, name: p.name, description: p.description, visible: p.available, images: p.images, options: p.options,
  }));
  const productCollections = catalog.products.flatMap(p => p.collectionIds.filter(c => collections.some(x => x.id === c)).map(c => ({ product_id: p.id, collection_id: c })));
  const prices = catalog.products.flatMap(p => p.prices.map(x => ({
    id: x.id, product_id: p.id, option_value_ids: x.optionValueIds, amount: x.amount, compare_at: x.compareAt,
    track_inventory: x.trackInventory, quantity: x.quantity, allow_out_of_stock: x.allowOutOfStock, active: true,
  })));
  const productIds = new Set(products.map(p => p.id));
  const priceIds = new Set(prices.map(p => p.id));
  const byId = Object.fromEntries(catalog.products.map(p => [p.id, p]));

  // Orders: oldest first, numbered 1, 2, 3… (new website orders start at 1001).
  const details = [];
  for (const f of await readdir(`${ghl}/orders`)) {
    const d = await json(`${ghl}/orders/${f}`);
    details.push(d.data ?? d);
  }
  const live = details.filter(d => d.liveMode !== false && !d.markAsTest).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const orders = [], orderItems = [];
  live.forEach((d, i) => {
    const id = uuidFrom(d._id);
    const c = d.contactSnapshot ?? {};
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null;
    const paid = d.status === 'completed';
    const sum = d.amountSummary ?? {};
    orders.push({
      id, number: i + 1, ghl_id: d._id, source: 'ghl',
      status: paid ? 'paid' : 'cancelled',
      fulfillment: d.fulfillmentStatus === 'fulfilled' ? 'fulfilled' : 'unfulfilled',
      customer_name: name, customer_email: c.email || null, customer_phone: c.phone || null,
      shipping_address: c.address1 ? { name: name ?? '', line1: c.address1, line2: '', city: c.city ?? '', state: c.state ?? '', postal_code: c.postalCode ?? '', country: c.country ?? 'AU' } : null,
      subtotal: money(sum.subtotal), shipping: money(sum.shipping), discount: money(sum.discount), total: money(d.amount),
      created_at: d.createdAt, paid_at: paid ? d.createdAt : null,
      fulfilled_at: d.fulfillmentStatus === 'fulfilled' ? d.updatedAt : null,
    });
    d.items.forEach((it, k) => {
      const productId = productIds.has(it.product?._id) ? it.product._id : null;
      const priceId = priceIds.has(it.price?._id) ? it.price._id : null;
      const opts = productId ? byId[productId].options : [];
      const variant = (it.price?.variantOptionIds ?? []).map(vid => opts.flatMap(o => o.values).find(v => v.id === vid)?.name).filter(Boolean).join(' / ');
      orderItems.push({
        id: uuidFrom(`${d._id}:${k}`), order_id: id, product_id: productId, price_id: priceId,
        name: (it.product?.name ?? it.name ?? 'Item').trim(), variant,
        image: productId ? byId[productId].images[0] ?? null : null,
        unit_amount: money(it.price?.amount), qty: it.qty || 1,
      });
    });
  });

  const contacts = [];
  const seen = new Set();
  for (const c of await json(`${ghl}/contacts_all.json`)) {
    const email = (c.email ?? '').trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    contacts.push({
      id: uuidFrom(c.id), ghl_id: c.id, email, first_name: (c.firstName ?? '').trim(), last_name: (c.lastName ?? '').trim(), phone: c.phone ?? '',
      newsletter: /email capture/i.test(c.source ?? '') && !c.dnd, source: 'ghl', created_at: c.dateAdded,
    });
  }

  return { collections, products, productCollections, prices, orders, orderItems, contacts };
}
