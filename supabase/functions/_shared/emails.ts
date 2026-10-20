// Email templates: the customer's order confirmation, Charlee's new-order and newsletter alerts.
// Table-based HTML with inline styles so they render in Gmail and Outlook.

export type Email = { to: string | string[]; replyTo?: string; subject: string; html: string; text: string; idempotencyKey?: string };

/** The shop's alert setting may hold several addresses: "info@…, someone@…". */
export const emailList = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
const alertTo = (notify: string) => { const to = emailList(notify); return to.length ? to : ['info@beadedbychar.com.au']; };

export type OrderForEmail = {
  id: string;
  number: number;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  subtotal: number;
  shipping: number;
  total: number;
  oversold?: boolean;
  items: { name: string; variant: string; image: string | null; unit_amount: number; qty: number }[];
};

const PINK = '#c96a7e', ROSE = '#e09faf', INK = '#222222', MUTED = '#667085';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const aud = (n: number | string) => `A$${Number(n).toFixed(2)}`;
const abs = (src: string, site: string) => (src.startsWith('http') ? src : site + src);

export function addressLines(a: OrderForEmail['shipping_address']): string[] {
  if (!a) return [];
  return [a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country && a.country !== 'AU' ? a.country : '']
    .filter((l): l is string => !!l && l.trim() !== '');
}

function layout(site: string, title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#fafafa;font-family:Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:6px;overflow:hidden">
<tr><td style="background:${ROSE};padding:18px 24px" align="center"><a href="${esc(site)}"><img src="${esc(site)}/img/site/logo.png" width="130" alt="BeadedByChar" style="display:block;border:0"></a></td></tr>
<tr><td style="padding:28px 24px 8px">${body}</td></tr>
<tr><td style="padding:20px 24px 28px;font-size:12px;color:${MUTED}" align="center">BeadedByChar · Handmade in Melbourne, Australia<br><a href="mailto:info@beadedbychar.com.au" style="color:${MUTED}">info@beadedbychar.com.au</a></td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(o: OrderForEmail, site: string): string {
  const rows = o.items.map(i => `<tr>
    <td width="56" style="padding:10px 0;border-bottom:1px solid #eee">${i.image ? `<img src="${esc(abs(i.image, site))}" width="48" height="48" alt="" style="display:block;border-radius:4px;object-fit:cover">` : ''}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:14px">${esc(i.name)}${i.variant ? `<br><span style="color:${MUTED};font-size:13px">${esc(i.variant)}</span>` : ''}<br><span style="color:${MUTED};font-size:13px">Qty ${i.qty}</span></td>
    <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;white-space:nowrap">${aud(i.unit_amount * i.qty)}</td></tr>`).join('');
  const sum = (label: string, value: string, bold = false) =>
    `<tr><td></td><td style="padding:6px 8px;font-size:14px;${bold ? 'font-weight:bold' : `color:${MUTED}`}">${label}</td><td align="right" style="padding:6px 0;font-size:14px;${bold ? 'font-weight:bold' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
    ${sum('Subtotal', aud(o.subtotal))}${sum('Shipping', aud(o.shipping))}${sum('Total', aud(o.total), true)}</table>`;
}

function itemsText(o: OrderForEmail): string {
  return o.items.map(i => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.qty}  ${aud(i.unit_amount * i.qty)}`).join('\n')
    + `\nSubtotal ${aud(o.subtotal)}\nShipping ${aud(o.shipping)}\nTotal ${aud(o.total)}`;
}

export function orderConfirmation(o: OrderForEmail, notify: string, site: string): Email {
  const replyTo = emailList(notify)[0] ?? 'info@beadedbychar.com.au';
  const first = (o.customer_name ?? '').trim().split(/\s+/)[0] || 'there';
  const addr = addressLines(o.shipping_address);
  const html = layout(site, `Order #${o.number}`, `
    <h1 style="margin:0 0 8px;font-size:22px">Thanks for your order, ${esc(first)}!</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Your order <strong>#${o.number}</strong> is confirmed. Charlee will pack it by hand and send it out soon.</p>
    ${itemsTable(o, site)}
    ${addr.length ? `<p style="margin:24px 0 4px;font-size:13px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em">Shipping to</p><p style="margin:0;font-size:14px;line-height:1.5">${addr.map(esc).join('<br>')}</p>` : ''}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.5">Questions about your order? Just reply to this email.</p>
    <p style="margin:24px 0 8px"><a href="${esc(site)}/collections" style="display:inline-block;background:${PINK};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px">Keep shopping</a></p>`);
  const text = `Thanks for your order, ${first}!\n\nYour order #${o.number} is confirmed. Charlee will pack it by hand and send it out soon.\n\n${itemsText(o)}\n\n${addr.length ? `Shipping to:\n${addr.join('\n')}\n\n` : ''}Questions about your order? Just reply to this email.\n\nBeadedByChar · ${site}`;
  return { to: o.customer_email!, replyTo, subject: `Your BeadedByChar order #${o.number}`, html, text, idempotencyKey: `order-${o.id}-confirmation` };
}

export function orderAlert(o: OrderForEmail, notify: string, site: string): Email {
  const to = alertTo(notify);
  const addr = addressLines(o.shipping_address);
  const link = `${site}/admin/#/orders/${o.id}`;
  const html = layout(site, `New order #${o.number}`, `
    <h1 style="margin:0 0 8px;font-size:22px">New order #${o.number} · ${aud(o.total)}</h1>
    ${o.oversold ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fef3f2;color:#b42318;font-size:14px">Heads up: this order includes more of an item than you had in stock.</p>` : ''}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${esc(o.customer_name)} · <a href="mailto:${esc(o.customer_email)}">${esc(o.customer_email)}</a>${o.customer_phone ? ` · ${esc(o.customer_phone)}` : ''}</p>
    ${itemsTable(o, site)}
    ${addr.length ? `<p style="margin:24px 0 4px;font-size:13px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em">Ship to</p><p style="margin:0;font-size:14px;line-height:1.5">${addr.map(esc).join('<br>')}</p>` : ''}
    <p style="margin:24px 0 8px"><a href="${esc(link)}" style="display:inline-block;background:${PINK};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px">Open the order</a></p>`);
  const text = `New order #${o.number} · ${aud(o.total)}\n${o.oversold ? '\nHeads up: this order includes more of an item than you had in stock.\n' : ''}\n${o.customer_name} · ${o.customer_email}${o.customer_phone ? ` · ${o.customer_phone}` : ''}\n\n${itemsText(o)}\n\n${addr.length ? `Ship to:\n${addr.join('\n')}\n\n` : ''}Open the order: ${link}`;
  return { to, replyTo: o.customer_email ?? undefined, subject: `New order #${o.number} · ${aud(o.total)}`, html, text, idempotencyKey: `order-${o.id}-alert` };
}

export function newsletterAlert(c: { first: string; last: string; email: string }, notify: string, site: string): Email {
  const to = alertTo(notify);
  const name = `${c.first} ${c.last}`.trim();
  const html = layout(site, 'New newsletter sign-up', `
    <h1 style="margin:0 0 8px;font-size:22px">New newsletter sign-up</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">${esc(name)} · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
    <p style="margin:0 0 8px"><a href="${esc(site)}/admin/#/contacts" style="color:${INK}">See all subscribers</a></p>`);
  return { to, subject: `New newsletter sign-up: ${name}`, html, text: `New newsletter sign-up: ${name} (${c.email})\n\nAll subscribers: ${site}/admin/#/contacts` };
}
