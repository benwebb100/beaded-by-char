import type { Option, Price } from './types';

export const aud = (n: number) => `$${Number(n).toFixed(2)}`;
const TZ = 'Australia/Melbourne';
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** Shrinks a photo in the browser to at most `max` px and re-encodes it as WebP before upload. */
export async function resizeImage(file: File, max = 1200, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that image'))), 'image/webp', quality));
}

// Product descriptions are stored as simple HTML; the editor shows plain text with blank lines between paragraphs.
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li)>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.trim().split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

/** Every combination of option values, e.g. Colour × Scent. A product with no options has one empty combination. */
export function combinations(options: Option[]): string[][] {
  return options.filter(o => o.values.length).reduce<string[][]>((acc, o) => acc.flatMap(c => o.values.map(v => [...c, v.id])), [[]]);
}

/**
 * Rebuilds the variant list after options change, keeping prices and stock for combinations that still exist.
 * New combinations start switched on only if they use a choice that was just added; gaps the shop never
 * sold (e.g. a colour/scent pairing with no price) stay switched off.
 */
export function syncVariants(options: Option[], prices: Price[], before: Option[] = options): Price[] {
  const template = prices[0] ?? { amount: 0, track_inventory: false, quantity: null, allow_out_of_stock: false, active: true, option_value_ids: [] };
  const key = (ids: string[]) => [...ids].sort().join('|');
  const byKey = new Map(prices.map(p => [key(p.option_value_ids), p]));
  const old = new Set(before.flatMap(o => o.values.map(v => v.id)));
  const optionsAdded = options.length !== before.length;
  return combinations(options).map(ids => byKey.get(key(ids)) ?? {
    ...template, id: undefined, option_value_ids: ids, quantity: template.track_inventory ? 0 : null,
    active: optionsAdded || prices.length === 0 || ids.some(id => !old.has(id)),
  });
}

export function variantLabel(options: Option[], ids: string[]): string {
  return options.map(o => o.values.find(v => ids.includes(v.id))?.name).filter(Boolean).join(' / ');
}

export const inStock = (p: Price) => !p.track_inventory || p.allow_out_of_stock || (p.quantity ?? 0) > 0;

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}

export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
