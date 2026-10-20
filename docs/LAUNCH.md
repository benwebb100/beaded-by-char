# Launch checklist

Supabase project: **Beadedbychar** (`bisyuxxbysvjvnbhfddq`, Sydney), in its own org.
Put keys in `.env` (gitignored), not in chat.

## Done
- [x] Supabase project created and this repo linked (Ben).
- [x] Database: tables, security rules and order/stock functions applied (`supabase db push`).
- [x] GHL data imported: 48 products, 108 prices, 10 categories, 89 past orders, 83 contacts.
- [x] Edge functions deployed (`checkout`, `stripe-webhook`, `newsletter`, `publish`) with `SITE_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM` set.
- [x] Auth: sign-ups off, 8-character passwords, site URL and `/admin/` redirect URLs.
- [x] GitHub secrets for the nightly backup and daily keep-alive; both run green.

## Ben
| # | What | Gives us |
|---|---|---|
| 1 | Send Charlee the message asking her to invite you to her Stripe (role **Developer**). Then copy the **test** secret key into `.env` as `STRIPE_SECRET_KEY=sk_test_…` | Card payments into her account |
| 2 | SendGrid → Settings → Sender Authentication → **Authenticate Your Domain** → `beadedbychar.com.au` (DNS host: Other). Paste the CNAME records it shows into Squarespace DNS, then click Verify. They don't touch the Google email records | Emails from `orders@beadedbychar.com.au` that don't land in spam |
| 3 | SendGrid → Settings → API Keys → Create → Restricted → **Mail Send: Full Access**. Copy into `.env` as `SENDGRID_API_KEY=SG.…` | Order and newsletter emails, password-reset emails |
| 4 | Connect the repo on Render (dashboard.render.com/blueprint/new?repo=https://github.com/benwebb100/beaded-by-char). When it asks: `PUBLIC_SUPABASE_URL=https://bisyuxxbysvjvnbhfddq.supabase.co`, `PUBLIC_SUPABASE_ANON_KEY=` the project's publishable key (`PUBLIC_SUPABASE_ANON_KEY` in `.env`). Then Settings → Deploy Hook → copy into `.env` as `RENDER_DEPLOY_HOOK=…` | The `onrender.com` test site; admin saves rebuild it |

## Claude, once those are in `.env`
- Supabase secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENDGRID_API_KEY`, `RENDER_DEPLOY_HOOK`; fix `SITE_URL` / `ALLOWED_ORIGINS` / auth redirect URLs if Render's URL isn't `beaded-by-char.onrender.com`.
- Create the Stripe webhook → `https://bisyuxxbysvjvnbhfddq.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
- Supabase Auth SMTP via SendGrid (`smtp.sendgrid.net:587`, user `apikey`) so password-reset emails come from the shop.
- Charlee's login: `node --env-file=.env scripts/create-admin.mjs info@beadedbychar.com.au <temp password>`.
- Test on the `onrender.com` URL with Stripe's test card `4242 4242 4242 4242`: order lands in the admin, both emails arrive, stock drops, refund shows.

## Waiting on Charlee
- Stripe invite.
- Instagram and TikTok profile links. The live site doesn't have them: its Instagram icon goes to instagram.com and the TikTok link is broken.
- The 13 old GHL orders still marked unfulfilled: the message assumes they were all sent. Mark them fulfilled unless she says otherwise.

## Decisions for Ben
- Stripe's own receipt emails: turn off (Stripe → Settings → Customer emails → Successful payments) so customers get one confirmation, not two?
- SendGrid has no free plan any more (60-day trial, then Essentials from US$19.95/mo). It costs nothing extra only if your account is already paid for another business. If it isn't, Resend's free tier (3,000 emails/month) also works: set `RESEND_API_KEY` instead and the functions use it.

## Cutover day
1. Day before: lower TTL on the `www` CNAME and the bare-domain A record in Squarespace.
2. Stripe: swap to the **live** secret key and add a live-mode webhook; set `SITE_URL=https://beadedbychar.com.au`.
3. Render: add custom domains `beadedbychar.com.au` and `www.beadedbychar.com.au`; remove `PUBLIC_NOINDEX`.
4. Squarespace DNS: point `www` and the bare domain at Render as Render instructs. **Leave MX and Google TXT records alone.**
5. Unpublish the GHL website / turn off its checkout.
6. Place one real order, refund it.
7. Send Charlee the admin link (`/admin`), her login, and point her at the Help tab.
8. Two weeks later: GHL snapshots and CSV exports done → cancel the agency → revoke the GHL token.
