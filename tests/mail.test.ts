import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailRequest, parseFrom } from '../supabase/functions/_shared/mail.ts';

const email = { to: 'jane@example.com', replyTo: 'info@beadedbychar.com.au', subject: 'Your order', html: '<p>Hi</p>', text: 'Hi', idempotencyKey: 'order-1' };

test('SendGrid request: plain text first, no click or open tracking, reply-to set', () => {
  const { url, init } = mailRequest('sendgrid', 'SG.key', 'BeadedByChar <orders@beadedbychar.com.au>', email);
  assert.equal(url, 'https://api.sendgrid.com/v3/mail/send');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer SG.key');
  const body = JSON.parse(init.body as string);
  assert.deepEqual(body.personalizations, [{ to: [{ email: 'jane@example.com' }] }]);
  assert.deepEqual(body.from, { name: 'BeadedByChar', email: 'orders@beadedbychar.com.au' });
  assert.deepEqual(body.reply_to, { email: 'info@beadedbychar.com.au' });
  assert.deepEqual(body.content.map((c: { type: string }) => c.type), ['text/plain', 'text/html']);
  assert.equal(body.tracking_settings.click_tracking.enable, false);
});

test('Resend request still works', () => {
  const { url, init } = mailRequest('resend', 're_key', 'BeadedByChar <orders@beadedbychar.com.au>', email);
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal((init.headers as Record<string, string>)['Idempotency-Key'], 'order-1');
  assert.deepEqual(JSON.parse(init.body as string).to, ['jane@example.com']);
});

test('from addresses parse with or without a name', () => {
  assert.deepEqual(parseFrom('orders@beadedbychar.com.au'), { email: 'orders@beadedbychar.com.au' });
  assert.deepEqual(parseFrom('  Beaded By Char  <a@b.co> '), { name: 'Beaded By Char', email: 'a@b.co' });
});
