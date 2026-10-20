// Click through the storefront: variant choice, add to cart, cart edits, pagination.
// usage: node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
const step = (s) => console.log('✓', s);

// Pagination on the all-products list.
await page.goto(base + '/products-list');
assert.equal(await page.locator('.card:visible').count(), 6);
assert.match(await page.locator('[data-label]').textContent(), /Page 1 \/ 8/);
await page.click('[data-next]');
assert.match(await page.locator('[data-label]').textContent(), /Page 2 \/ 8/);
assert.match(page.url(), /page=2/);
step('product list paginates 6 per page');

// Unavailable product card.
await page.goto(base + '/products-list/collections/tumblers');
assert.equal(await page.locator('.unavailable').count(), 1);
step('out-of-stock tumbler shows "Currently unavailable"');

// Variant product: default selection and price.
await page.goto(base + '/product-details/product/66387c4e07ee03293bd6bddf');
assert.equal(await page.locator('select').first().evaluate(s => s.selectedOptions[0].textContent), 'blue');
assert.equal(await page.locator('[data-price]').textContent(), 'AU$21.00');
await page.click('[data-step="1"]');
await page.click('[data-add]');
await page.waitForSelector('[data-added]:not([hidden])');
assert.equal(await page.locator('[data-cart-count]').textContent(), '2');
step('variant product defaults to first variant and adds 2 to cart');

// Simple product.
await page.goto(base + '/product-details/product/6623799a7c32be6d8b35cb5d');
await page.click('[data-add]');
assert.equal(await page.locator('[data-cart-count]').textContent(), '3');
step('simple product adds to cart; header count updates');

// Cart page.
await page.goto(base + '/cart');
assert.equal(await page.locator('.line').count(), 2);
assert.equal(await page.locator('[data-subtotal]').textContent(), 'AU$54.95');
await page.locator('.line').first().locator('[data-minus]').click();
assert.equal(await page.locator('[data-subtotal]').textContent(), 'AU$33.95');
await page.locator('.line').last().locator('[data-remove]').click();
assert.equal(await page.locator('.line').count(), 1);
assert.equal(await page.locator('[data-checkout]').isDisabled(), false);
step('cart totals, quantity change and remove work');

// Checkout without a configured endpoint lands on the placeholder.
await page.click('[data-checkout]');
await page.waitForURL(/\/checkout/);
step('checkout button reaches the placeholder page');

// Thank-you clears the cart when Stripe returns.
await page.goto(base + '/thank-you?session_id=test');
await page.goto(base + '/cart');
assert.equal(await page.locator('.line').count(), 0);
step('thank-you page clears the cart');

// Every page in the sitemap of links resolves.
await page.goto(base + '/');
const hrefs = await page.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href')))]);
for (const h of hrefs) { const r = await page.request.get(base + h); assert.equal(r.status(), 200, h); }
step(`all ${hrefs.length} internal links on the home page return 200`);

assert.deepEqual(errors, []);
step('no console errors');
await browser.close();
