import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminApi, Collection, Contact, Order, OrderFilter, OrderRow, Price, Product, Settings } from './types';

const PAID = ['paid', 'refunded', 'partially_refunded'];

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

type ProductRowDb = {
  id: string; name: string; description: string; visible: boolean; images: string[]; options: Product['options'];
  prices: (Price & { id: string })[]; product_collections: { collection_id: string }[];
};
const toProduct = (r: ProductRowDb): Product => ({
  id: r.id, name: r.name, description: r.description, visible: r.visible, images: r.images ?? [], options: r.options ?? [],
  prices: (r.prices ?? []).map(p => ({ id: p.id, option_value_ids: p.option_value_ids, amount: Number(p.amount), track_inventory: p.track_inventory, quantity: p.quantity, allow_out_of_stock: p.allow_out_of_stock, active: p.active })),
  collection_ids: (r.product_collections ?? []).map(c => c.collection_id),
});
const PRODUCT_COLS = 'id, name, description, visible, images, options, prices(*), product_collections(collection_id)';

export class SupabaseApi implements AdminApi {
  readonly demo = false;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    return data.session?.user.email ? { email: data.session.user.email } : null;
  }
  onAuthChange(cb: (e: 'signed_in' | 'signed_out' | 'password_recovery') => void) {
    this.sb.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') cb('password_recovery');
      else if (event === 'SIGNED_IN') cb('signed_in');
      else if (event === 'SIGNED_OUT') cb('signed_out');
    });
  }
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  }
  async signOut() { await this.sb.auth.signOut(); }
  async sendPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin/` });
    if (error) throw new Error(error.message);
  }
  async setPassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }
  async isAdmin() {
    const { data } = await this.sb.from('admins').select('user_id').maybeSingle();
    return !!data;
  }

  async listOrders(filter: OrderFilter): Promise<OrderRow[]> {
    let q = this.sb.from('orders').select('id, number, created_at, status, fulfillment, customer_name, customer_email, total, oversold, source, order_items(qty)');
    if (filter === 'unpaid') q = q.in('status', ['pending', 'cancelled']);
    else q = q.in('status', filter === 'unfulfilled' ? ['paid'] : PAID);
    if (filter === 'unfulfilled' || filter === 'fulfilled') q = q.eq('fulfillment', filter);
    const rows = must(await q.order('created_at', { ascending: false }).limit(1000)) as (OrderRow & { order_items: { qty: number }[] })[];
    return rows.map(({ order_items, ...r }) => ({ ...r, total: Number(r.total), item_count: order_items.reduce((n, i) => n + i.qty, 0) }));
  }
  async countToFulfil() {
    const { count } = await this.sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid').eq('fulfillment', 'unfulfilled');
    return count ?? 0;
  }
  async getOrder(id: string): Promise<Order> {
    const o = must(await this.sb.from('orders').select('*, items:order_items(*)').eq('id', id).single()) as Order;
    const num = (n: unknown) => Number(n);
    return { ...o, total: num(o.total), subtotal: num(o.subtotal), shipping: num(o.shipping), discount: num(o.discount), item_count: o.items.reduce((n, i) => n + i.qty, 0), items: o.items.map(i => ({ ...i, unit_amount: num(i.unit_amount) })) };
  }
  async setFulfillment(id: string, value: Order['fulfillment']) { must(await this.sb.from('orders').update({ fulfillment: value }).eq('id', id).select('id')); }
  async setNote(id: string, note: string) { must(await this.sb.from('orders').update({ note }).eq('id', id).select('id')); }

  async listProducts() {
    return (must(await this.sb.from('products').select(PRODUCT_COLS).order('name')) as ProductRowDb[]).map(toProduct);
  }
  async getProduct(id: string) {
    return toProduct(must(await this.sb.from('products').select(PRODUCT_COLS).eq('id', id).single()) as ProductRowDb);
  }
  async saveProduct(p: Product): Promise<string> {
    const row = { name: p.name.trim(), description: p.description, visible: p.visible, images: p.images, options: p.options };
    const id = p.id
      ? (must(await this.sb.from('products').update(row).eq('id', p.id).select('id').single()) as { id: string }).id
      : (must(await this.sb.from('products').insert(row).select('id').single()) as { id: string }).id;

    // Variants: update the ones that exist, add new ones, remove the ones no longer listed.
    const existing = (must(await this.sb.from('prices').select('id').eq('product_id', id)) as { id: string }[]).map(r => r.id);
    const keep = p.prices.filter(x => x.id).map(x => x.id!);
    const gone = existing.filter(x => !keep.includes(x));
    if (gone.length) must(await this.sb.from('prices').delete().in('id', gone).select('id'));
    const fields = (x: Price) => ({ product_id: id, option_value_ids: x.option_value_ids, amount: x.amount, track_inventory: x.track_inventory, quantity: x.track_inventory ? (x.quantity ?? 0) : x.quantity, allow_out_of_stock: x.allow_out_of_stock, active: x.active });
    const updates = p.prices.filter(x => x.id).map(x => ({ id: x.id, ...fields(x) }));
    const inserts = p.prices.filter(x => !x.id).map(fields);
    if (updates.length) must(await this.sb.from('prices').upsert(updates).select('id'));
    if (inserts.length) must(await this.sb.from('prices').insert(inserts).select('id'));

    must(await this.sb.from('product_collections').delete().eq('product_id', id).select('product_id'));
    if (p.collection_ids.length) must(await this.sb.from('product_collections').insert(p.collection_ids.map(c => ({ product_id: id, collection_id: c }))).select('product_id'));
    return id;
  }
  async deleteProduct(id: string) { must(await this.sb.from('products').delete().eq('id', id).select('id')); }
  async uploadImage(file: Blob, folder: string) {
    const path = `${folder}/${crypto.randomUUID()}.webp`;
    must(await this.sb.storage.from('product-images').upload(path, file, { contentType: 'image/webp', cacheControl: '31536000' }));
    return this.sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  async listCollections() {
    return must(await this.sb.from('collections').select('id, name, slug, image, sort').order('sort').order('name')) as Collection[];
  }
  async saveCollection(c: Collection) {
    const row = { name: c.name.trim(), slug: c.slug, image: c.image, sort: c.sort };
    if (c.id) must(await this.sb.from('collections').update(row).eq('id', c.id).select('id'));
    else must(await this.sb.from('collections').insert(row).select('id'));
  }
  async deleteCollection(id: string) { must(await this.sb.from('collections').delete().eq('id', id).select('id')); }

  async listContacts() {
    return must(await this.sb.from('contacts').select('id, email, first_name, last_name, phone, newsletter, source, created_at').order('created_at', { ascending: false }).limit(5000)) as Contact[];
  }

  async getSettings() {
    const s = must(await this.sb.from('settings').select('shop_open, shipping_amount, shipping_label, notify_email, catalog_changed_at, published_at').single()) as Settings;
    return { ...s, shipping_amount: Number(s.shipping_amount) };
  }
  async saveSettings(s: Partial<Settings>) {
    const { catalog_changed_at, published_at, ...editable } = s;
    must(await this.sb.from('settings').update(editable).eq('id', true).select('id'));
  }
  async publish() {
    const { error } = await this.sb.functions.invoke('publish', { method: 'POST' });
    if (error) throw new Error('Couldn’t update the website. Try again in a minute.');
  }
}
