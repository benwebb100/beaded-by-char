import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { OrderFilter, OrderRow } from '../types';
import { aud, fmtDate } from '../util';

const TABS: { key: OrderFilter; label: string }[] = [
  { key: 'unfulfilled', label: 'Unfulfilled' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'all', label: 'All paid' },
  { key: 'unpaid', label: 'Abandoned' },
];

export function StatusPills({ o }: { o: Pick<OrderRow, 'status' | 'fulfillment' | 'oversold' | 'source'> }) {
  return (
    <span class="pills">
      {o.status === 'refunded' && <span class="pill red">Refunded</span>}
      {o.status === 'partially_refunded' && <span class="pill red">Part refunded</span>}
      {(o.status === 'pending' || o.status === 'cancelled') && <span class="pill grey">Not paid</span>}
      {o.oversold && <span class="pill amber" title="Sold more than was in stock">Check stock</span>}
      {o.source === 'ghl' && <span class="pill grey" title="Placed on the old website">Old site</span>}
    </span>
  );
}

export function Orders() {
  const { api, toast, refreshBadge } = useApp();
  const [tab, setTab] = useState<OrderFilter>(() => (sessionStorage.getItem('orders-tab') as OrderFilter) || 'unfulfilled');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    try { sessionStorage.setItem('orders-tab', tab); } catch { /* private mode */ }
    setRows(null);
    api.listOrders(tab).then(setRows).catch(e => toast(e.message, 'error'));
  }, [tab]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!rows || !s) return rows;
    return rows.filter(r => `${r.number} ${r.customer_name ?? ''} ${r.customer_email ?? ''}`.toLowerCase().includes(s));
  }, [rows, q]);

  const toggle = async (o: OrderRow, e: Event) => {
    e.preventDefault();
    const next = o.fulfillment === 'fulfilled' ? 'unfulfilled' : 'fulfilled';
    try {
      await api.setFulfillment(o.id, next);
      setRows(rs => (tab === 'unfulfilled' || tab === 'fulfilled' ? rs!.filter(r => r.id !== o.id) : rs!.map(r => (r.id === o.id ? { ...r, fulfillment: next } : r))));
      toast(next === 'fulfilled' ? `Order #${o.number} marked fulfilled` : `Order #${o.number} moved back to unfulfilled`);
      refreshBadge();
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <section>
      <div class="head-row"><h1>Orders</h1></div>
      <div class="seg">{TABS.map(t => <button class={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
      <input class="search" type="search" placeholder="Search by name, email or order number" value={q} onInput={e => setQ(e.currentTarget.value)} />
      {!shown ? <p class="muted">Loading…</p> : shown.length === 0 ? (
        <p class="empty">{q ? 'No orders match that search.' : tab === 'unfulfilled' ? 'All caught up: no orders waiting to be sent.' : 'No orders here yet.'}</p>
      ) : (
        <ul class="list">
          {shown.map(o => (
            <li>
              <a href={`#/orders/${o.id}`} class="row">
                <div class="main">
                  <strong>#{o.number} · {o.customer_name || o.customer_email || 'Unknown'}</strong>
                  <span class="muted">{fmtDate(o.created_at)} · {o.item_count} item{o.item_count === 1 ? '' : 's'} · {aud(o.total)}</span>
                  <StatusPills o={o} />
                </div>
                {(o.status === 'paid' || o.status === 'partially_refunded') && (
                  <button class={`btn small ${o.fulfillment === 'fulfilled' ? '' : 'primary'}`} onClick={e => toggle(o, e)}>
                    {o.fulfillment === 'fulfilled' ? 'Undo' : 'Mark fulfilled'}
                  </button>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
