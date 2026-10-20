import { headers } from './lib/supabase-rest.mjs';
// Creates (or resets) a shop admin login. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// usage: node --env-file=.env scripts/create-admin.mjs <email> <temporary password>
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) throw new Error('usage: create-admin.mjs <email> <password of 8+ characters>');
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
const h = { ...headers(key), 'Content-Type': 'application/json' };

const list = await (await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: h })).json();
let user = list.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
const res = user
  ? await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ password, email_confirm: true }) })
  : await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, email_confirm: true }) });
if (!res.ok) throw new Error(`auth: ${res.status} ${await res.text()}`);
user = await res.json();

const add = await fetch(`${url}/rest/v1/admins?on_conflict=user_id`, { method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: user.id, email }) });
if (!add.ok) throw new Error(`admins: ${add.status} ${await add.text()}`);
console.log(`✓ ${email} can sign in at /admin/ with that password (and change it under Settings).`);
