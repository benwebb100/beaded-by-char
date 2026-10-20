import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { Product } from '../types';
import { aud, inStock } from '../util';

export function stockSummary(p: Product): { text: string; tone: '' | 'amber' | 'red' } {
  const live = p.prices.filter(x => x.active);
  if (!live.length) return { text: 'No prices', tone: 'red' };
  const tracked = live.filter(x => x.track_inventory && !x.allow_out_of_stock);
  const out = live.filter(x => !inStock(x)).length;
  if (out === live.length) return { text: 'Sold out', tone: 'red' };
  if (out) return { text: `${out} of ${live.length} options sold out`, tone: 'amber' };
  if (!tracked.length) return { text: 'Not tracking stock', tone: '' };
  const left = tracked.reduce((n, x) => n + (x.quantity ?? 0), 0);
  return { text: `${left} in stock`, tone: left <= 2 ? 'amber' : '' };
}

export function priceRange(p: Product): string {
  const a = p.prices.filter(x => x.active).map(x => x.amount);
  if (!a.length) return '—';
  const lo = Math.min(...a), hi = Math.max(...a);
  return lo === hi ? aud(lo) : `${aud(lo)} – ${aud(hi)}`;
}

type Filter = 'all' | 'stock' | 'hidden';

export function Products() {
  const { api, toast } = useApp();
  const [rows, setRows] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { api.listProducts().then(setRows).catch(e => toast(e.message, 'error')); }, []);

  const shown = useMemo(() => (rows ?? []).filter(p => {
    if (q.trim() && !p.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (filter === 'hidden') return !p.visible;
    if (filter === 'stock') return stockSummary(p).tone !== '';
    return true;
  }), [rows, q, filter]);

  return (
    <section>
      <div class="head-row">
        <h1>Products</h1>
        <a class="btn primary" href="#/products/new">+ Add product</a>
      </div>
      <div class="seg">
        <button class={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        <button class={filter === 'stock' ? 'on' : ''} onClick={() => setFilter('stock')}>Low or sold out</button>
        <button class={filter === 'hidden' ? 'on' : ''} onClick={() => setFilter('hidden')}>Hidden</button>
        <a href="#/categories" class="seg-link">Categories →</a>
      </div>
      <input class="search" type="search" placeholder="Search products" value={q} onInput={e => setQ(e.currentTarget.value)} />
      {!rows ? <p class="muted">Loading…</p> : shown.length === 0 ? <p class="empty">No products match.</p> : (
        <ul class="list">
          {shown.map(p => {
            const s = stockSummary(p);
            return (
              <li>
                <a href={`#/products/${p.id}`} class="row">
                  {p.images[0] ? <img src={p.images[0]} alt="" width="56" height="56" class="thumb" /> : <span class="noimg thumb" />}
                  <div class="main">
                    <strong>{p.name}</strong>
                    <span class="muted">{priceRange(p)}</span>
                    <span class="pills">
                      <span class={`pill ${s.tone || 'grey'}`}>{s.text}</span>
                      {!p.visible && <span class="pill grey">Hidden</span>}
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
