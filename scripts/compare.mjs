// Side-by-side screenshots of the live GHL site (left) and the local build (right).
// usage: node scripts/compare.mjs [baseUrl] [path...]   (needs `npm run preview` running)
import { execFileSync } from 'node:child_process';
import { readdir, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const [base = 'http://127.0.0.1:4321', ...args] = process.argv.slice(2);
const paths = args.length ? args : ['/', '/about', '/collections', '/products-list', '/products-list/collections/tumblers',
  '/product-details/product/66387c4e07ee03293bd6bddf', '/product-details/product/6623799a7c32be6d8b35cb5d', '/cart', '/privacy-policy'];

execFileSync('node', ['scripts/capture.mjs', base, 'discovery/new', ...paths], { stdio: 'inherit' });
await mkdir('discovery/compare', { recursive: true });

const slugs = paths.map(p => p.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home');
const have = new Set(await readdir('discovery/live'));
for (const slug of slugs) for (const vp of ['desktop', 'mobile']) {
  const file = `${slug}.${vp}.png`;
  if (!have.has(file)) continue;
  const [a, b] = [sharp(`discovery/live/${file}`), sharp(`discovery/new/${file}`)];
  const [ma, mb] = await Promise.all([a.metadata(), b.metadata()]);
  const w = ma.width, h = Math.max(ma.height, mb.height), gap = 20;
  await sharp({ create: { width: w * 2 + gap, height: h, channels: 3, background: '#ff00ff' } })
    .composite([{ input: `discovery/live/${file}`, left: 0, top: 0 }, { input: `discovery/new/${file}`, left: w + gap, top: 0 }])
    .png().toFile(`discovery/compare/${file}`);
  console.log(`compare/${file}  live ${ma.height}px  new ${mb.height}px`);
}
