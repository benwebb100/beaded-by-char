// Demo mode: the admin runs on sample data in memory when Supabase isn't configured.
// Products are the real public catalogue; orders and contacts are made up.
import catalog from '../data/catalog.json';
import type { AdminApi, Collection, Contact, Order, OrderFilter, Product, Settings } from './types';

const sleep = (ms = 150) => new Promise(r => setTimeout(r, ms));
const clone = <T,>(x: T): T => structuredClone(x);
const id = () => crypto.randomUUID().replace(/-/g, '');

const collections: Collection[] = catalog.collections.map((c, i) => ({ id: c.id, name: c.name, slug: c.slug, image: (catalog.site.tiles as Record<string, string>)[c.slug] ?? null, sort: i }));
const products: Product[] = catalog.products.map(p => ({
  id: p.id, name: p.name, description: p.description, visible: p.available, images: p.images, options: p.options,
  prices: p.prices.map(x => ({ id: x.id, option_value_ids: x.optionValueIds, amount: x.amount, track_inventory: x.trackInventory, quantity: x.quantity, allow_out_of_stock: x.allowOutOfStock, active: true })),
  collection_ids: p.collectionIds,
}));

const people = ['Sample Customer', 'Test Shopper', 'Example Buyer', 'Demo Person', 'Pretend Client', 'Mock Purchaser'];
const suburbs = [['Glen Huntly', 'VIC', '3163'], ['Fitzroy', 'VIC', '3065'], ['Geelong', 'VIC', '3220'], ['Bondi', 'NSW', '2026'], ['Paddington', 'QLD', '4064']];
const orders: Order[] = Array.from({ length: 14 }, (_, n) => {
  const p1 = products[(n * 7) % products.length], p2 = products[(n * 11 + 3) % products.length];
  const items = [p1, ...(n % 3 === 0 ? [p2] : [])].map((p, k) => ({ id: id(), product_id: p.id!, name: p.name, variant: '', image: p.images[0] ?? null, unit_amount: p.prices[0].amount, qty: k === 0 && n % 4 === 0 ? 2 : 1 }));
  const subtotal = items.reduce((s, i) => s + i.unit_amount * i.qty, 0);
  const name = `${people[n % people.length]} ${n + 1}`;
  const [city, state, postal_code] = suburbs[n % suburbs.length];
  const created = new Date(Date.now() - n * 2.6 * 86400e3);
  const status = n === 9 ? 'refunded' : n === 12 ? 'cancelled' : 'paid';
  return {
    id: id(), number: 1104 - n, created_at: created.toISOString(), status, fulfillment: n < 3 || status !== 'paid' ? 'unfulfilled' : 'fulfilled',
    customer_name: name, customer_email: `sample${n + 1}@example.com`, customer_phone: '0400 000 000',
    shipping_address: { name, line1: `${n + 10} Sample Street`, city, state, postal_code, country: 'AU' },
    subtotal, shipping: 15, discount: 0, total: subtotal + 15, item_count: items.reduce((s, i) => s + i.qty, 0),
    oversold: n === 1, note: n === 4 ? 'Asked for gift wrapping' : '', paid_at: created.toISOString(), fulfilled_at: null,
    stripe_payment_intent: null, source: n > 10 ? 'ghl' : 'website', items,
  } satisfies Order;
});
const contacts: Contact[] = orders.map((o, i) => ({ id: id(), email: o.customer_email!, first_name: o.customer_name!.split(' ')[0], last_name: o.customer_name!.split(' ').slice(1).join(' '), phone: '', newsletter: i % 3 === 0, source: i % 3 === 0 ? 'newsletter' : 'order', created_at: o.created_at }));
const settings: Settings = { shop_open: true, shipping_amount: 15, shipping_label: 'Standard delivery', notify_email: 'info@beadedbychar.com.au', catalog_changed_at: new Date().toISOString(), published_at: new Date().toISOString() };
const touch = () => { settings.catalog_changed_at = new Date().toISOString(); };

export class DemoApi implements AdminApi {
  readonly demo = true;
  private user: { email: string } | null = null;
  private listeners: ((e: 'signed_in' | 'signed_out' | 'password_recovery') => void)[] = [];

  async currentUser() { return this.user; }
  onAuthChange(cb: (e: 'signed_in' | 'signed_out' | 'password_recovery') => void) { this.listeners.push(cb); }
  async signIn(email: string) { await sleep(); this.user = { email: email || 'demo@example.com' }; this.listeners.forEach(l => l('signed_in')); }
  async signOut() { this.user = null; this.listeners.forEach(l => l('signed_out')); }
  async sendPasswordReset() { await sleep(); }
  async setPassword() { await sleep(); }
  async isAdmin() { return true; }

  async listOrders(filter: OrderFilter) {
    await sleep();
    return clone(orders.filter(o => filter === 'unpaid' ? ['pending', 'cancelled'].includes(o.status)
      : filter === 'unfulfilled' ? o.status === 'paid' && o.fulfillment === 'unfulfilled'
      : filter === 'fulfilled' ? o.status !== 'pending' && o.status !== 'cancelled' && o.fulfillment === 'fulfilled'
      : !['pending', 'cancelled'].includes(o.status)));
  }
  async countToFulfil() { return orders.filter(o => o.status === 'paid' && o.fulfillment === 'unfulfilled').length; }
  async getOrder(oid: string) { await sleep(); const o = orders.find(x => x.id === oid); if (!o) throw new Error('Order not found'); return clone(o); }
  async setFulfillment(oid: string, value: Order['fulfillment']) { await sleep(); const o = orders.find(x => x.id === oid)!; o.fulfillment = value; o.fulfilled_at = value === 'fulfilled' ? new Date().toISOString() : null; }
  async setNote(oid: string, note: string) { await sleep(); orders.find(x => x.id === oid)!.note = note; }

  async listProducts() { await sleep(); return clone(products).sort((a, b) => a.name.localeCompare(b.name)); }
  async getProduct(pid: string) { await sleep(); const p = products.find(x => x.id === pid); if (!p) throw new Error('Product not found'); return clone(p); }
  async saveProduct(p: Product) {
    await sleep(300);
    const saved = clone({ ...p, prices: p.prices.map(x => ({ ...x, id: x.id ?? id() })) });
    if (p.id) products[products.findIndex(x => x.id === p.id)] = saved;
    else { saved.id = id(); products.push(saved); }
    touch();
    return saved.id!;
  }
  async deleteProduct(pid: string) { await sleep(); products.splice(products.findIndex(x => x.id === pid), 1); touch(); }
  async uploadImage(file: Blob) { await sleep(400); return URL.createObjectURL(file); }

  async listCollections() { await sleep(); return clone(collections).sort((a, b) => a.sort - b.sort); }
  async saveCollection(c: Collection) {
    await sleep();
    if (c.id) collections[collections.findIndex(x => x.id === c.id)] = clone(c);
    else collections.push({ ...clone(c), id: id() });
    touch();
  }
  async deleteCollection(cid: string) {
    await sleep();
    collections.splice(collections.findIndex(x => x.id === cid), 1);
    products.forEach(p => { p.collection_ids = p.collection_ids.filter(x => x !== cid); });
    touch();
  }

  async listContacts() { await sleep(); return clone(contacts); }
  async getSettings() { await sleep(); return clone(settings); }
  async saveSettings(s: Partial<Settings>) { await sleep(); Object.assign(settings, s); }
  async publish() { await sleep(600); settings.published_at = new Date().toISOString(); }
}
