# Beaded by Char

@/Users/benwebb/Documents/Obsidian Vault/02 Projects/Beaded by Char/_context/About.md

This project rebuilds beadedbychar.com.au off GoHighLevel: an Astro static storefront on Render, Supabase (Postgres, auth, storage, edge functions), Charlee's own Stripe account, Resend emails, and an admin portal for Charlee at `/admin`.

`docs/LAUNCH.md` is the launch checklist: what's left, who does it, and the cutover steps.

## Layout
- `src/pages/` holds the storefront. URLs match the old GHL site, e.g. `/product-details/product/<GHL product id>` and `/products-list/collections/<slug>`.
- `src/data/catalog.json` is the catalogue the pages build from. `scripts/sync-catalog.mjs` refreshes it from Supabase before each build when `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` are set; otherwise the committed copy is used.
- The cart is client-side (`src/scripts/cart.ts`) and sends only price ids and quantities. The `checkout` function re-prices from the database.
- `src/admin/` is the Preact admin (hash routes). With no Supabase env it runs in demo mode on sample data, except on the real domain.
- `supabase/migrations/` holds the schema, RLS policies and the order/stock functions (`create_pending_order`, `mark_order_paid`, …).
- `supabase/functions/` has `checkout`, `stripe-webhook`, `newsletter` and `publish`. Logic lives in `_shared/shop.ts` and `_shared/emails.ts`, with no Deno APIs, so Node tests import them. `_shared/runtime.ts` wires in the real Supabase, Stripe, Resend and Render clients.
- After admin edits, the `publish` function hits the Render deploy hook.

## Commands
- `npm test` runs the PGlite schema/RLS tests, unit tests and the full order flow. The GHL import test skips when `discovery/` is absent.
- `npx tsc -p tsconfig.check.json` type-checks the admin. `npx deno check supabase/functions/*/index.ts` type-checks the functions.
- `npm run build`; `npx astro preview --port 4321`.
- Browser checks (need the preview running): `node scripts/smoke.mjs`, `node scripts/admin-smoke.mjs` (demo admin), `node scripts/compare.mjs` (side-by-side with the live GHL site).
- Checkout in a browser without accounts: `node scripts/dev-backend.ts 8787`, build with `PUBLIC_CHECKOUT_ENDPOINT=http://127.0.0.1:8787/functions/v1/checkout PUBLIC_NEWSLETTER_ENDPOINT=http://127.0.0.1:8787/functions/v1/newsletter`, then `node scripts/e2e-local.mjs`. (Port 54321 is taken by CleanMyMac on this machine.)
- One-offs that need `.env`: `scripts/ghl-*.sh` (read-only GHL pulls), `scripts/import-ghl.mjs` (refuses to re-run once website orders exist), `scripts/create-admin.mjs`.

`discovery/` is gitignored working material and includes customer data from GHL. Never commit it.
