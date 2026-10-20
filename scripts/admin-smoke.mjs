// Clicks through the admin portal in demo mode and saves screenshots to discovery/admin/.
// usage: node scripts/admin-smoke.mjs [baseUrl]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:4321';
await mkdir('discovery/admin', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const step = s => console.log('✓', s);

for (const [vp, size] of [['desktop', { width: 1280, height: 860 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: size, acceptDownloads: true });
  page.on('pageerror', e => errors.push(`${vp}: ${e.message}`));
  page.on('console', m => m.type() === 'error' && errors.push(`${vp}: ${m.text()}`));
  const shot = name => page.screenshot({ path: `discovery/admin/${name}.${vp}.png`, fullPage: true });
  page.on('dialog', d => d.accept());

  await page.goto(base + '/admin/');
  await shot('login');
  await page.fill('input[type=email]', 'charlee@example.com');
  await page.click('button.primary');
  await page.waitForSelector('.list > li');
  await page.waitForFunction(() => document.querySelector('.tabs .badge'));
  const before = await page.locator('.list > li').count();
  assert.ok(before > 0);
  assert.equal(await page.locator('.tabs .badge').textContent(), String(before));
  await shot('orders');
  step(`${vp}: signed in; ${before} unfulfilled orders, badge matches`);

  await page.locator('.list > li').first().locator('button').click();
  await page.waitForSelector('.toast');
  assert.equal(await page.locator('.list > li').count(), before - 1);
  assert.equal(await page.locator('.tabs .badge').textContent(), String(before - 1));
  step(`${vp}: mark fulfilled from the list moves it off the tab`);

  await page.click('.seg button:text("Fulfilled")');
  await page.waitForSelector('.list > li a.row');
  await page.locator('.list > li a.row').first().click();
  await page.waitForSelector('h1:text-matches("Order #")');
  assert.ok(await page.locator('.items li').count() >= 1);
  await page.fill('textarea', 'Posted with AusPost, tracking 123');
  await page.locator('textarea').blur();
  await page.waitForSelector('.toast:text("Note saved")');
  await page.click('button:text("Copy address")').catch(() => {});
  await shot('order');
  step(`${vp}: order page shows items, saves a private note`);

  await page.click('.tabs a:text("Products")');
  await page.waitForSelector('.list > li');
  assert.ok(await page.locator('.list > li').count() >= 40);
  await page.click('.seg button:text("Low or sold out")');
  const low = await page.locator('.list > li').count();
  assert.ok(low >= 1);
  await page.click('.seg button:text("All")');
  await shot('products');
  step(`${vp}: product list with stock filter (${low} low or sold out)`);

  await page.fill('.search', 'Butterfly car');
  await page.waitForFunction(() => document.querySelectorAll('.list > li').length === 1);
  await page.locator('.list > li a').first().click();
  await page.waitForSelector('h1:text("Butterfly car diffusers")');
  const variants = await page.locator('.variant').count();
  assert.ok(variants >= 2, `variants ${variants}`);
  await page.locator('.variant').first().locator('input[type=number]').first().fill('22.50');
  await page.locator('.option').first().locator('.chip-input').fill('green');
  await page.locator('.option').first().locator('.chip-input').press('Enter');
  const after = await page.locator('.variant').count();
  assert.ok(after > variants, `adding a colour adds variants (${variants} -> ${after})`);
  await shot('product-edit');
  await page.click('.savebar button.primary');
  await page.waitForSelector('.toast:text("Saved")');
  await page.waitForSelector('.publish.waiting');
  step(`${vp}: edit price, add an option value (${variants} -> ${after} variants), save queues a website update`);

  await page.click('.publish button:text("Update now")');
  await page.waitForSelector('.publish.done');
  step(`${vp}: "Update now" publishes`);

  await page.goto(base + '/admin/#/products/new');
  await page.waitForSelector('h1:text("New product")');
  await page.fill('form .card label:has-text("Name") input', 'Test Pen');
  await page.locator('.variant input[type=number]').first().fill('9.95');
  await page.locator('.checks label').first().click();
  await page.click('.savebar button.primary');
  await page.waitForSelector('h1:text("Test Pen")');
  step(`${vp}: create a new product`);
  await page.click('.savebar button.danger');
  await page.waitForSelector('h1:text("Products")');
  step(`${vp}: delete it again`);

  await page.goto(base + '/admin/#/categories');
  await page.waitForSelector('.list > li');
  assert.equal(await page.locator('.list > li').count(), 10);
  await page.locator('.list > li').nth(1).locator('button[title="Move up"]').click();
  await page.waitForTimeout(400);
  await shot('categories');
  step(`${vp}: categories list and reorder`);

  await page.click('.tabs a:text("Customers")');
  await page.waitForSelector('.list > li');
  const dl = page.waitForEvent('download');
  await page.click('button:text("Download CSV")');
  assert.match((await dl).suggestedFilename(), /beadedbychar-customers-.*\.csv/);
  await shot('customers');
  step(`${vp}: customers list and CSV download`);

  await page.click('.tabs a:text("Settings")');
  await page.waitForSelector('h1:text("Settings")');
  await page.fill('label.inline input', '12.50');
  await page.click('button:text("Save settings")');
  await page.waitForSelector('.toast:text("Settings saved")');
  await shot('settings');
  step(`${vp}: settings save`);

  await page.click('button:text("Sign out")');
  await page.waitForSelector('h1:text("Shop admin")');
  step(`${vp}: sign out`);
  await page.close();
}

await browser.close();
assert.deepEqual(errors, []);
console.log('✓ no console errors');
