import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { Order } from '../types';
import { aud, fmtDateTime } from '../util';
import { StatusPills } from './Orders';

const addressText = (a: Order['shipping_address']) =>
  a ? [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country && a.country !== 'AU' ? a.country : ''].filter(Boolean).join('\n') : '';

export function OrderView({ id }: { id: string }) {
  const { api, toast, refreshBadge } = useApp();
  const [o, setO] = useState<Order | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getOrder(id).then(x => { setO(x); setNote(x.note); }).catch(e => toast(e.message, 'error'));
  }, [id]);

  if (!o) return <p class="muted">Loading…</p>;
  const address = addressText(o.shipping_address);
  const paid = o.status === 'paid' || o.status === 'partially_refunded';

  const toggle = async () => {
    const next = o.fulfillment === 'fulfilled' ? 'unfulfilled' : 'fulfilled';
    setBusy(true);
    try {
      await api.setFulfillment(o.id, next);
      setO({ ...o, fulfillment: next, fulfilled_at: next === 'fulfilled' ? new Date().toISOString() : null });
      toast(next === 'fulfilled' ? 'Marked fulfilled' : 'Moved back to unfulfilled');
      refreshBadge();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const saveNote = async () => {
    if (note === o.note) return;
    try { await api.setNote(o.id, note); setO({ ...o, note }); toast('Note saved'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); toast('Address copied'); } catch { toast('Couldn’t copy. Select the address and copy it instead.', 'error'); }
  };

  return (
    <section>
      <a href="#/orders" class="back">← Orders</a>
      <div class="head-row">
        <h1>Order #{o.number}</h1>
        <StatusPills o={o} />
      </div>
      <p class="muted">{fmtDateTime(o.created_at)}{o.fulfilled_at && ` · fulfilled ${fmtDateTime(o.fulfilled_at)}`}</p>

      {paid && (
        <button class={`btn wide ${o.fulfillment === 'fulfilled' ? '' : 'primary'}`} disabled={busy} onClick={toggle}>
          {o.fulfillment === 'fulfilled' ? '✓ Fulfilled · tap to undo' : 'Mark as fulfilled'}
        </button>
      )}
      {o.oversold && <p class="warn">This order includes more of an item than you had in stock. Check you can make it, or contact the customer.</p>}

      <div class="grid2">
        <div class="card">
          <h2>Items</h2>
          <ul class="items">
            {o.items.map(i => (
              <li>
                {i.image ? <img src={i.image} alt="" width="56" height="56" /> : <span class="noimg" />}
                <div><strong>{i.name}</strong>{i.variant && <span class="muted">{i.variant}</span>}<span class="muted">{i.qty} × {aud(i.unit_amount)}</span></div>
                <span>{aud(i.qty * i.unit_amount)}</span>
              </li>
            ))}
          </ul>
          <dl class="totals">
            <dt>Subtotal</dt><dd>{aud(o.subtotal)}</dd>
            {o.discount > 0 && <><dt>Discount</dt><dd>−{aud(o.discount)}</dd></>}
            <dt>Shipping</dt><dd>{aud(o.shipping)}</dd>
            <dt class="strong">Total</dt><dd class="strong">{aud(o.total)}</dd>
          </dl>
          {o.stripe_payment_intent && <a class="link" target="_blank" href={`https://dashboard.stripe.com/payments/${o.stripe_payment_intent}`}>View payment in Stripe ↗</a>}
        </div>

        <div>
          <div class="card">
            <h2>Customer</h2>
            <p><strong>{o.customer_name}</strong></p>
            {o.customer_email && <p><a class="link" href={`mailto:${o.customer_email}?subject=${encodeURIComponent(`Your BeadedByChar order #${o.number}`)}`}>{o.customer_email}</a></p>}
            {o.customer_phone && <p><a class="link" href={`tel:${o.customer_phone.replace(/\s/g, '')}`}>{o.customer_phone}</a></p>}
          </div>
          <div class="card">
            <div class="head-row"><h2>Ship to</h2>{address && <button class="btn small" onClick={copy}>Copy address</button>}</div>
            {address ? <p class="pre">{address}</p> : <p class="muted">No shipping address on this order.</p>}
          </div>
          <div class="card">
            <h2>Private note</h2>
            <textarea rows={3} placeholder="Only you can see this, e.g. tracking number" value={note} onInput={e => setNote(e.currentTarget.value)} onBlur={saveNote} />
          </div>
        </div>
      </div>
    </section>
  );
}
