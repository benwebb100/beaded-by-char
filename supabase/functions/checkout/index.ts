// POST { lines: [{ priceId, qty }] } -> { url } of a Stripe Checkout page for those items.
import { createCheckout } from '../_shared/shop.ts';
import { deps, serveJson } from '../_shared/runtime.ts';

serveJson(async req => createCheckout(await req.json().catch(() => null), deps()));
