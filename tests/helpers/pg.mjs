// An in-memory Postgres (PGlite) with stand-ins for Supabase's auth and storage schemas and its
// default API-role grants, with every migration applied.
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const f of (await readdir('supabase/migrations')).sort()) {
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  }
  return db;
}
