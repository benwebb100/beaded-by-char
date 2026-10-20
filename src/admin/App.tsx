import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import type { AdminApi } from './types';
import { SupabaseApi } from './supabase-api';
import { DemoApi } from './demo-api';
import { Login, NewPassword } from './views/Login';
import { Orders } from './views/Orders';
import { OrderView } from './views/OrderView';
import { Products } from './views/Products';
import { ProductEdit } from './views/ProductEdit';
import { Categories } from './views/Categories';
import { Contacts } from './views/Contacts';
import { SettingsView } from './views/Settings';
import { Help } from './views/Help';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
// Demo mode (sample data) is for local and test builds only; never on the real domain.
const live = typeof location !== 'undefined' && location.hostname.endsWith('beadedbychar.com.au');
const api: AdminApi | null = url && key ? new SupabaseApi(url, key) : live ? null : new DemoApi();

type PublishState = 'idle' | 'waiting' | 'publishing' | 'done' | 'error';
type Ctx = {
  api: AdminApi;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  /** Call after any catalogue change; the website rebuilds shortly after the last one. */
  changed: () => void;
  refreshBadge: () => void;
};
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

function useHashRoute() {
  // Supabase auth redirects can land with tokens or errors in the hash; those aren't routes.
  const read = () => { const h = location.hash.replace(/^#/, ''); return !h || /(^|&)(access_token|error)=/.test(h) ? '/orders' : h; };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
export const go = (path: string) => { location.hash = path; };

const PUBLISH_DELAY = 15_000;

export default function App() {
  if (!api) return <div class="center muted">The shop admin isn’t connected yet.</div>;
  return <Admin api={api} />;
}

function Admin({ api }: { api: AdminApi }) {
  const [auth, setAuth] = useState<'loading' | 'signed_out' | 'recovery' | 'not_admin' | 'ready'>('loading');
  const [email, setEmail] = useState('');
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);
  const [publish, setPublish] = useState<PublishState>('idle');
  const [stale, setStale] = useState(false);
  const [badge, setBadge] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const route = useHashRoute();

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  const check = useCallback(async () => {
    const user = await api.currentUser();
    if (!user) return setAuth(a => (a === 'recovery' ? a : 'signed_out'));
    setEmail(user.email);
    setAuth((await api.isAdmin()) ? 'ready' : 'not_admin');
  }, []);

  useEffect(() => {
    api.onAuthChange(e => (e === 'password_recovery' ? setAuth('recovery') : check()));
    check();
  }, []);

  const refreshBadge = useCallback(() => { api.countToFulfil().then(setBadge).catch(() => {}); }, []);

  useEffect(() => {
    if (auth !== 'ready') return;
    refreshBadge();
    api.getSettings().then(s => setStale(!s.published_at || s.catalog_changed_at > s.published_at)).catch(() => {});
  }, [auth]);

  const runPublish = useCallback(async () => {
    clearTimeout(timer.current);
    setPublish('publishing');
    try {
      await api.publish();
      setPublish('done');
      setStale(false);
      setTimeout(() => setPublish(p => (p === 'done' ? 'idle' : p)), 8000);
    } catch (e) {
      setPublish('error');
      toast((e as Error).message, 'error');
    }
  }, []);

  const changed = useCallback(() => {
    setStale(true);
    setPublish('waiting');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(runPublish, PUBLISH_DELAY);
  }, []);

  // Don't lose a queued rebuild if Charlee closes the tab straight after saving.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (publish === 'waiting') { e.preventDefault(); runPublish(); } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [publish]);

  if (auth === 'loading') return <div class="center muted">Loading…</div>;
  if (auth === 'recovery') return <NewPassword api={api} onDone={() => { setAuth('loading'); check(); }} />;
  if (auth === 'signed_out') return <Login api={api} />;
  if (auth === 'not_admin') return (
    <div class="center card narrow">
      <h1>No access</h1>
      <p>{email} isn’t set up as a shop admin.</p>
      <button class="btn" onClick={() => api.signOut()}>Sign out</button>
    </div>
  );

  const [, section, sub] = route.split('/');
  const view =
    section === 'orders' && sub ? <OrderView id={sub} /> :
    section === 'products' && sub ? <ProductEdit id={sub === 'new' ? undefined : sub} /> :
    section === 'products' ? <Products /> :
    section === 'categories' ? <Categories /> :
    section === 'contacts' ? <Contacts /> :
    section === 'settings' ? <SettingsView email={email} /> :
    section === 'help' ? <Help /> :
    <Orders />;

  const nav = [
    { href: '#/orders', label: 'Orders', on: section === 'orders' || !section, badge },
    { href: '#/products', label: 'Products', on: section === 'products' || section === 'categories' },
    { href: '#/contacts', label: 'Customers', on: section === 'contacts' },
    { href: '#/settings', label: 'Settings', on: section === 'settings' },
  ];

  return (
    <AppCtx.Provider value={{ api, toast, changed, refreshBadge }}>
      {api.demo && <div class="demo">Demo mode: sample orders and customers. Nothing you change here is saved.</div>}
      <header class="top">
        <a href="#/orders" class="brand"><img src="/img/site/logo.webp" alt="" width="92" height="48" /><span>Shop admin</span></a>
        <nav class="tabs">
          {nav.map(n => <a href={n.href} class={n.on ? 'on' : ''}>{n.label}{n.badge ? <b class="badge">{n.badge}</b> : null}</a>)}
        </nav>
        <a href="#/help" class="view-site help-link">Help</a>
        <a href="/" target="_blank" class="view-site">View website ↗</a>
      </header>
      {(stale || publish !== 'idle') && (
        <div class={`publish ${publish}`}>
          {publish === 'waiting' && <>Your changes go live on the website shortly. <button class="link" onClick={runPublish}>Update now</button></>}
          {publish === 'publishing' && <>Updating the website… this takes about 2 minutes.</>}
          {publish === 'done' && <>Website update started. Changes will show in about 2 minutes.</>}
          {publish === 'error' && <>The website didn’t update. <button class="link" onClick={runPublish}>Try again</button></>}
          {publish === 'idle' && stale && <>Some changes aren’t on the website yet. <button class="link" onClick={runPublish}>Update website</button></>}
        </div>
      )}
      <main class="page">{view}</main>
      <div class="toasts" aria-live="polite">{toasts.map(t => <div class={`toast ${t.kind}`}>{t.msg}</div>)}</div>
    </AppCtx.Provider>
  );
}
