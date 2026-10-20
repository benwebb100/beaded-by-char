// One-off import: the text of the live Privacy Policy and Terms pages -> src/content/*.html
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const pages = { privacy: '/privacy-policy', terms: '/terms-of-service' };
await mkdir('src/content', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const [name, path] of Object.entries(pages)) {
  await page.goto('https://beadedbychar.com.au' + path, { waitUntil: 'networkidle' });
  const html = await page.evaluate(() => {
    // The legal text sits in the first section below the nav; the last section is the footer.
    const sections = [...document.querySelectorAll('.fullSection')];
    const body = sections[1];
    return [...body.querySelectorAll('.c-heading .text-output, .c-paragraph .text-output')].map(el => el.innerHTML).join('\n');
  });
  const clean = html
    .replace(/<\/?(span|font|div)[^>]*>/gi, '')
    .replace(/\s(style|class|data-[\w-]+)="[^"]*"/gi, '')
    .replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '')
    .replace(/&nbsp;/g, ' ');
  await writeFile(`src/content/${name}.html`, clean.trim() + '\n');
  console.log(name, clean.length, 'chars');
}
await browser.close();
