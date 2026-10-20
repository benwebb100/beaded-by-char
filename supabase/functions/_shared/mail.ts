// HTTP requests for the email providers. SendGrid is used when SENDGRID_API_KEY is set,
// otherwise Resend. Pure builders, so the request shapes are unit-tested in Node.
import type { Email } from './emails.ts';

export type Provider = 'sendgrid' | 'resend';

/** "BeadedByChar <orders@beadedbychar.com.au>" -> { name, email } */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

export function mailRequest(provider: Provider, key: string, from: string, e: Email): { url: string; init: RequestInit } {
  const to = Array.isArray(e.to) ? e.to : [e.to];
  if (provider === 'sendgrid') {
    return {
      url: 'https://api.sendgrid.com/v3/mail/send',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: to.map(email => ({ email })) }],
          from: parseFrom(from),
          ...(e.replyTo ? { reply_to: { email: e.replyTo } } : {}),
          subject: e.subject,
          content: [{ type: 'text/plain', value: e.text }, { type: 'text/html', value: e.html }],   // plain text must come first
          categories: ['beadedbychar'],
          // Keep links pointing at our own domains (no SendGrid redirect), and no tracking pixel.
          tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
        }),
      },
    };
  }
  return {
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(e.idempotencyKey ? { 'Idempotency-Key': e.idempotencyKey } : {}) },
      body: JSON.stringify({ from, to, reply_to: e.replyTo, subject: e.subject, html: e.html, text: e.text }),
    },
  };
}
