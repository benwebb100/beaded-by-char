// Browser test of checkout and the newsletter against scripts/dev-backend.ts.
// usage: node scripts/e2e-local.mjs [siteUrl] [backendUrl]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const site = process.argv[2] ?? 'http://127.0.0.1:4321';
const backend = process.argv[3] ?? 'http://127.0.0.1:8787';
const state = () => fetch(`${backend}/debug/orders`).then(r => r.json());
const step = s => console.log('✓', s);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Two items into the cart, then pay.
await page.goto(site + '/product-details/product/66387c4e07ee03293bd6bddf');
await page.click('[data-add]');
await page.goto(site + '/product-details/product/6623799a7c32be6d8b35cb5d');
await page.click('[data-step="1"]');
await page.click('[data-add]');
await page.goto(site + '/cart');
assert.equal(await page.locator('[data-subtotal]').textContent(), 'AU$46.90');
await page.click('[data-checkout]');
await page.waitForURL(/\/thank-you\?session_id=cs_local_/);
await page.waitForTimeout(400);
let s = await state();
assert.equal(s.orders.length, 1);
assert.deepEqual(s.orders[0], { number: 1001, status: 'paid', total: 61.9, customer_email: 'tester@example.com' });
assert.equal(s.emails.length, 2);
step('cart → checkout → thank-you; order #1001 paid at A$61.90 incl. A$15 shipping; 2 emails sent');

await page.goto(site + '/cart');
assert.equal(await page.locator('.line').count(), 0);
step('cart is empty after paying');

// A sold-out item sneaks into the cart (e.g. an old tab): checkout refuses with a clear message.
await page.evaluate(() => localStorage.setItem('bbc-cart-v1', JSON.stringify([{ priceId: '673aee1fc3efe0ae20263f13', productId: '673aee1fc3efe03c3e263f11', name: 'Blue Ombré Christmas Glass Tumbler', variant: '', amount: 20.95, image: null, url: '/', qty: 1 }])));
await page.reload();
await page.click('[data-checkout]');
await page.waitForSelector('[data-error]:not([hidden])');
assert.match(await page.locator('[data-error]').textContent(), /Blue Ombré Christmas Glass Tumbler has just sold out/);
assert.equal((await state()).orders.length, 1);
step('sold-out item: checkout shows "has just sold out" and creates no order');

// Newsletter.
await page.goto(site + '/');
await page.fill('input[name=first_name]', 'Local');
await page.fill('input[name=last_name]', 'Tester');
await page.fill('input[name=email]', 'news@example.com');
await page.click('.news button[type=submit]');
await page.waitForSelector('.news .status:not([hidden])');
assert.match(await page.locator('.news .status').textContent(), /Thanks for joining/);
s = await state();
assert.equal(s.emails.at(-1), 'New newsletter sign-up: Local Tester');
step('newsletter form saves the sign-up and alerts Charlee');

await browser.close();
assert.deepEqual(errors, []);
step('no page errors');
