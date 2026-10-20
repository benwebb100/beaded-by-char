// One-off import: GHL product data (discovery/ghl) -> src/data/catalog.json, and every image
// the site uses -> public/img/*.webp (downloaded once into discovery/media-raw, then resized).
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const GHL = 'discovery/ghl';
const RAW = 'discovery/media-raw';
const OUT_IMG = 'public/img';
await mkdir(RAW, { recursive: true });
await mkdir(`${OUT_IMG}/p`, { recursive: true });
await mkdir(`${OUT_IMG}/site`, { recursive: true });

const json = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = p => access(p).then(() => true, () => false);

async function fetchRaw(url) {
  const name = createHash('sha1').update(url).digest('hex').slice(0, 16);
  const path = `${RAW}/${name}`;
  if (!(await exists(path))) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

// Resize to fit `max` px on the long edge and save as webp. Returns the public URL.
async function image(url, outName, max, opts = {}) {
  const out = `${OUT_IMG}/${outName}.webp`;
  if (!(await exists(out))) {
    const raw = await fetchRaw(url);
    await sharp(raw).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: opts.quality ?? 80, alphaQuality: 100 }).toFile(out);
  }
  return '/' + out.replace(/^public\//, '');
}

// Keep only plain structural tags from GHL's rich text; drop inline styles and spans.
function cleanHtml(html = '') {
  return html
    .replace(/<\/?(span|font|div)[^>]*>/gi, '')
    .replace(/\s(style|class|data-[\w-]+)="[^"]*"/gi, '')
    .replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

const collections = (await json(`${GHL}/collections.json`)).data.map(c => ({ id: c._id, name: c.name, slug: c.slug }));

const products = [];
for (const summary of (await json(`${GHL}/products.json`)).products) {
  const id = summary._id;
  const d = await json(`${GHL}/products/${id}.json`);
  const prices = (await json(`${GHL}/products/${id}.prices.json`)).prices ?? [];
  const medias = (d.medias ?? []).filter(m => m.type === 'image');
  if (!medias.length && d.image) medias.push({ url: d.image, isFeatured: true });
  medias.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));

  const images = [];
  for (const [i, m] of medias.entries()) images.push(await image(m.url, `p/${id}-${i}`, 1000));

  products.push({
    id,
    name: d.name.trim(),
    description: cleanHtml(d.description),
    collectionIds: d.collectionIds ?? [],
    available: d.availableInStore !== false,
    images,
    options: (d.variants ?? []).map(v => ({
      id: v.id, name: v.name.trim(),
      values: v.options.map(o => ({ id: o.id, name: o.name.trim() })),
    })),
    prices: prices.filter(p => !p.deleted).map(p => ({
      id: p._id,
      optionValueIds: p.variantOptionIds ?? [],
      amount: p.amount,
      compareAt: p.compareAtPrice ?? null,
      trackInventory: !!p.trackInventory,
      quantity: p.availableQuantity ?? null,
      allowOutOfStock: !!p.allowOutOfStockPurchases,
    })),
  });
  process.stdout.write('.');
}
products.sort((a, b) => a.name.localeCompare(b.name));

// Site imagery: logo and the category circle tiles (the tile images have the label baked in).
const media = 'https://storage.googleapis.com/msgsndr/k99WWlO7oYFG9xusH0XF/media/';
const tiles = {
  keychains: '6628c34cc2107cd9d4deed71.png', pens: '6628c34862f772e98f2d46fd.png', scrunchies: '6628c35d8381f2105f15e27f.png',
  'car-diffuser': '6628c342c2107c1370deed6b.png', mystery: '6628c33e8381f21acf15e257.png', 'hair-claws': '66566ff5c6bcc83203d6c4bd.png',
  tiktok: '66673c6693aa330779bfe466.png', 'room-sprays': '66ad9b328899dc8e42890f4b.png', tumblers: '6732b8607f10cddfb62fa87a.png',
  candles: '686e53c33e1a2534847c6ec2.png',
};
const site = { logo: await image('https://assets.cdn.filesafe.space/k99WWlO7oYFG9xusH0XF/media/662468509fa1bd2f40b75a3c.png', 'site/logo', 400, { quality: 90 }), tiles: {} };
for (const [slug, file] of Object.entries(tiles)) site.tiles[slug] = await image(media + file, `site/tile-${slug}`, 940);

await mkdir('src/data', { recursive: true });
await writeFile('src/data/catalog.json', JSON.stringify({ collections, products, site }, null, 1));
const files = await readdir(`${OUT_IMG}/p`);
console.log(`\n${products.length} products, ${collections.length} collections, ${files.length} product images`);
