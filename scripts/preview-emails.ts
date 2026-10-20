// Writes sample emails to discovery/emails/*.html and screenshots them, for a visual check.
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { orderConfirmation, orderAlert, newsletterAlert, type OrderForEmail } from '../supabase/functions/_shared/emails.ts';

const site = process.argv[2] ?? 'http://127.0.0.1:4321';
const order: OrderForEmail = {
  id: 'demo', number: 1091, created_at: new Date().toISOString(), customer_name: 'Sample Customer', customer_email: 'sample@example.com',
  customer_phone: '0400 000 000', shipping_address: { name: 'Sample Customer', line1: '1 Sample Street', line2: 'Unit 2', city: 'Melbourne', state: 'VIC', postal_code: '3000', country: 'AU' },
  subtotal: 33.95, shipping: 15, total: 48.95, items: [
    { name: 'Butterfly car diffusers', variant: 'blue / Japanese Honeysuckle', image: '/img/p/66387c4e07ee03293bd6bddf-0.webp', unit_amount: 21, qty: 1 },
    { name: 'Black Pug Keychain', variant: '', image: '/img/p/6623799a7c32be6d8b35cb5d-0.webp', unit_amount: 12.95, qty: 1 },
  ],
};
await mkdir('discovery/emails', { recursive: true });
const emails = { confirmation: orderConfirmation(order, 'info@beadedbychar.com.au', site), alert: orderAlert(order, 'info@beadedbychar.com.au', site), newsletter: newsletterAlert({ first: 'Sample', last: 'Person', email: 'sample@example.com' }, 'info@beadedbychar.com.au', site) };
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 640, height: 900 } });
for (const [name, e] of Object.entries(emails)) {
  await writeFile(`discovery/emails/${name}.html`, e.html);
  await page.setContent(e.html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `discovery/emails/${name}.png`, fullPage: true });
  console.log(name, '|', e.subject);
}
await browser.close();
