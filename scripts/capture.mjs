// Capture full-page screenshots, rendered HTML and links for pages of a site.
// usage: node scripts/capture.mjs <baseUrl> <outDir> <path> [path...]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const [base, outDir, ...paths] = process.argv.slice(2);
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

for (const [vp, size] of Object.entries(viewports)) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const path of paths) {
    const slug = path.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home';
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
    // Scroll through so lazy images and on-scroll animations settle.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${slug}.${vp}.png`, fullPage: true });
    if (vp === 'desktop') {
      await writeFile(`${outDir}/${slug}.html`, await page.content());
      const links = await page.$$eval('a[href]', as => [...new Set(as.map(a => a.href))]);
      await writeFile(`${outDir}/${slug}.links.json`, JSON.stringify(links, null, 1));
    }
    console.log(vp, path, 'ok');
  }
  await ctx.close();
}
await browser.close();
