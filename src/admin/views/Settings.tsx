import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../App';
import type { Settings } from '../types';

export function SettingsView({ email }: { email: string }) {
  const { api, toast } = useApp();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => { api.getSettings().then(setS).catch(e => toast(e.message, 'error')); }, []);
  if (!s) return <p class="muted">Loading…</p>;

  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try { await api.saveSettings({ shop_open: s.shop_open, shipping_amount: s.shipping_amount, shipping_label: s.shipping_label.trim() || 'Standard delivery', notify_email: s.notify_email.trim() }); toast('Settings saved'); }
    catch (err) { toast((err as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const changePassword = async (e: Event) => {
    e.preventDefault();
    if (password.length < 8) return toast('Use at least 8 characters.', 'error');
    try { await api.setPassword(password); setPassword(''); toast('Password changed'); }
    catch (err) { toast((err as Error).message, 'error'); }
  };

  return (
    <section>
      <h1>Settings</h1>
      <form class="card" onSubmit={save}>
        <h2>Shop</h2>
        <label class="check big"><input type="checkbox" checked={s.shop_open} onChange={e => setS({ ...s, shop_open: e.currentTarget.checked })} /> Taking orders</label>
        <p class="muted small">Untick to pause checkout, e.g. while you’re away. People can still browse.</p>
        <label class="inline">Shipping price $<input type="number" min="0" step="0.01" inputmode="decimal" value={s.shipping_amount} onInput={e => setS({ ...s, shipping_amount: Number(e.currentTarget.value) })} /></label>
        <label>Shipping name shown at checkout<input value={s.shipping_label} onInput={e => setS({ ...s, shipping_label: e.currentTarget.value })} /></label>
        <label>Send new-order emails to<input type="email" required value={s.notify_email} onInput={e => setS({ ...s, notify_email: e.currentTarget.value })} /></label>
        <button class="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
      </form>

      <form class="card" onSubmit={changePassword}>
        <h2>Your account</h2>
        <p class="muted">Signed in as {email}</p>
        <label>New password<input type="password" autocomplete="new-password" value={password} onInput={e => setPassword(e.currentTarget.value)} /></label>
        <div class="savebar inline">
          <button class="btn" disabled={!password}>Change password</button>
          <span class="spacer" />
          <button type="button" class="btn danger" onClick={() => api.signOut()}>Sign out</button>
        </div>
      </form>

      <div class="card">
        <h2>Payments and refunds</h2>
        <p>Payments go straight to your Stripe account. To refund an order, open it here, tap “View payment in Stripe”, then use Refund in Stripe. The order here updates by itself.</p>
        <a class="link" target="_blank" href="https://dashboard.stripe.com/payments">Open Stripe ↗</a>
      </div>
    </section>
  );
}
