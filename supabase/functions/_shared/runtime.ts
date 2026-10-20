// Deno-side wiring for the edge functions: Supabase (service role), Stripe, Resend, Render.
import Stripe from 'npm:stripe@23.0.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { Deps, Result } from './shop.ts';
import type { Email, OrderForEmail } from './emails.ts';

const get = (name: string) => Deno.env.get(name) ?? '';
function need(name: string): string {
  const v = get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

export const SITE_URL = () => (get('SITE_URL') || 'https://beadedbychar.com.au').replace(/\/$/, '');

let _db: ReturnType<typeof createClient> | null = null;
export function db() {
  _db ??= createClient(need('SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY') || need('SB_SECRET_KEY'), { auth: { persistSession: false } });
  return _db;
}

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  _stripe ??= new Stripe(need('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn as never, args as never);   // untyped schema
  if (error) throw new Error(error.message);
  return data as T;
}

async function sendEmail(e: Email): Promise<void> {
  const key = get('RESEND_API_KEY');
  if (!key) { console.log(`email skipped (no RESEND_API_KEY): ${e.subject} -> ${e.to}`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(e.idempotencyKey ? { 'Idempotency-Key': e.idempotencyKey } : {}) },
    body: JSON.stringify({ from: get('EMAIL_FROM') || 'BeadedByChar <orders@beadedbychar.com.au>', to: [e.to], reply_to: e.replyTo, subject: e.subject, html: e.html, text: e.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export async function rebuildSite(): Promise<void> {
  const hook = get('RENDER_DEPLOY_HOOK');
  if (!hook) { console.log('rebuild skipped (no RENDER_DEPLOY_HOOK)'); return; }
  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) throw new Error(`Render deploy hook ${res.status}`);
  await rpc('mark_published', {});
}

export function deps(): Deps {
  return {
    env: { SITE_URL: SITE_URL() },
    rpc,
    get stripe() { return stripe() as unknown as Deps['stripe']; },   // only checkout needs the Stripe key
    getOrder: async id => {
      const { data, error } = await db().from('orders').select('*, items:order_items(name, variant, image, unit_amount, qty)').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data as unknown as OrderForEmail;
    },
    notifyEmail: async () => {
      const { data } = await db().from('settings').select('notify_email').single();
      return (data as { notify_email?: string } | null)?.notify_email || 'info@beadedbychar.com.au';
    },
    sendEmail,
    rebuildSite,
    log: (...a) => console.error(...a),
  };
}

const allowed = () => [SITE_URL(), ...get('ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean)];

/** JSON endpoint for the browser: CORS, POST only, errors become 500s. */
export function serveJson(handler: (req: Request) => Promise<Result>) {
  Deno.serve(async req => {
    const origin = req.headers.get('Origin') ?? '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
    if (allowed().includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, content-type, apikey, x-client-info';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
    try {
      const r = await handler(req);
      return new Response(JSON.stringify(r.body), { status: r.status, headers });
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers });
    }
  });
}
