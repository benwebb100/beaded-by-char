# Beaded by Char

@/Users/benwebb/Documents/Obsidian Vault/02 Projects/Beaded by Char/_context/About.md

This project rebuilds beadedbychar.com.au off GoHighLevel: a storefront clone on Render, plus Supabase, her Stripe account and an admin portal for Charlee.

## Layout
- `src/` is the Astro static storefront. URLs match the old GHL site, e.g. `/product-details/product/<GHL product id>` and `/products-list/collections/<slug>`, so existing links keep working.
- `src/data/catalog.json` holds the product catalogue (imported from GHL). Pages read it via `src/lib/catalog.ts`. The Supabase step replaces the JSON source and keeps the same shape.
- The cart is client-side only (`src/scripts/cart.ts`, localStorage). Checkout must re-price every line server-side.
- `render.yaml` defines the Render static site, the redirects for old GHL URLs and `PUBLIC_NOINDEX` for the test URL.

## Scripts
- `npm run build` builds the site; `npx astro preview --port 4321` serves the build.
- `node scripts/smoke.mjs [url]` clicks through the shop flow.
- `node scripts/compare.mjs [url]` produces side-by-side screenshots against the live GHL site (in `discovery/compare/`).
- One-off GHL importers (read-only, need `.env`): `scripts/ghl-pull.sh`, `scripts/ghl-catalog.sh`, `scripts/build-catalog.mjs`, `scripts/extract-legal.mjs`.

`discovery/` is gitignored working material and includes customer data from GHL. Never commit it.
