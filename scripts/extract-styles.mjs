// Dump computed styles of visible text, boxes and images on a page, for rebuilding it by hand.
// usage: node scripts/extract-styles.mjs <url> <out.json> [width]
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const [url, out, width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: +width, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

const data = await page.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y + scrollY), Math.round(b.width), Math.round(b.height)]; };
  const vis = el => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && b.width > 0 && b.height > 0; };
  const inWidget = el => !!el.closest('chat-widget, #chat-widget, [class*="lc_text-widget"]');
  const text = [], boxes = [], imgs = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || inWidget(el)) continue;
    const s = getComputedStyle(el);
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (own) text.push({ t: own.slice(0, 70), tag: el.tagName.toLowerCase(), box: r(el), ff: s.fontFamily.split(',')[0].replace(/"/g, ''), fs: s.fontSize, fw: s.fontWeight, fst: s.fontStyle !== 'normal' ? s.fontStyle : undefined, c: s.color, lh: s.lineHeight, ls: s.letterSpacing !== 'normal' ? s.letterSpacing : undefined, tt: s.textTransform !== 'none' ? s.textTransform : undefined, ta: s.textAlign, href: el.closest('a')?.getAttribute('href') || undefined });
    const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' ? s.backgroundColor : undefined;
    const bgi = s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 200) : undefined;
    const bd = s.borderTopWidth !== '0px' || s.borderBottomWidth !== '0px' ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor} / bottom ${s.borderBottomWidth} ${s.borderBottomColor}` : undefined;
    if (bg || bgi || bd || (s.borderRadius !== '0px' && el.tagName !== 'IMG')) boxes.push({ tag: el.tagName.toLowerCase(), id: el.id || undefined, cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60) || undefined, box: r(el), bg, bgi, bd, br: s.borderRadius !== '0px' ? s.borderRadius : undefined, sh: s.boxShadow !== 'none' ? s.boxShadow : undefined, pad: s.padding });
    if (el.tagName === 'IMG') imgs.push({ src: el.currentSrc || el.src, alt: el.alt, box: r(el), fit: s.objectFit, br: s.borderRadius });
    if (el.tagName === 'svg' && !el.closest('svg svg')) imgs.push({ svg: el.outerHTML.slice(0, 1500), box: r(el), c: s.color });
  }
  return { url: location.href, height: document.body.scrollHeight, bodyBg: getComputedStyle(document.body).backgroundColor, text, boxes, imgs };
});
await writeFile(out, JSON.stringify(data, null, 1));
console.log(out, 'text', data.text.length, 'boxes', data.boxes.length, 'imgs', data.imgs.length);
await browser.close();
