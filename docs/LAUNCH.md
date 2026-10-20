# Launch checklist

Everything below the line "Claude does" can be done by Claude Code once the accounts exist.
Put keys in `.env` (gitignored), not in chat.

## 1. Accounts only Ben can create

| # | What | Where | Gives us |
|---|---|---|---|
| 1 | New **free** Supabase organisation (not the Pro one), then run `supabase login` in Terminal | supabase.com → New organization → Free | Database, logins, photo storage, functions |
| 2 | Charlee invites Ben to her Stripe account (Settings → Team → Invite, role *Administrator*). Copy the **test** secret key into `.env` as `STRIPE_SECRET_KEY=sk_test_…` | dashboard.stripe.com | Card payments into her account |
| 3 | Free Resend account → API key into `.env` as `RESEND_API_KEY=re_…` | resend.com | Order and newsletter emails |
| 4 | Connect the repo on Render with the Blueprint link, then Settings → Deploy Hook → copy into `.env` as `RENDER_DEPLOY_HOOK=…` | dashboard.render.com/blueprint/new?repo=https://github.com/benwebb100/beaded-by-char | The `onrender.com` test site; admin saves rebuild it |
| 5 | Paste the DNS records Claude gets from Resend into Squarespace DNS. They're on a `send.` subdomain and don't touch the Google email records | Squarespace → Domains → DNS | Emails from `orders@beadedbychar.com.au` that don't land in spam |

## 2. Claude does

- Create the Supabase project in the free org, apply `supabase/migrations`, deploy the four functions, set function secrets:
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RENDER_DEPLOY_HOOK`, `SITE_URL`, `ALLOWED_ORIGINS`, `EMAIL_FROM`.
- Auth settings: site URL and `/admin/` redirect URLs, sign-ups off (see `supabase/config.toml`), Resend as the SMTP sender for password-reset emails.
- Create the Stripe webhook → `https://<ref>.supabase.co/functions/v1/stripe-webhook` for
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
- Add the domain in Resend and hand over the DNS records.
- `node --env-file=.env scripts/import-ghl.mjs`: catalogue, 89 past orders, 83 contacts.
- `node --env-file=.env scripts/create-admin.mjs info@beadedbychar.com.au <temp password>`: Charlee's login.
- Render env vars `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`; GitHub secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (backup + keep-alive workflows).
- Test on the `onrender.com` URL with Stripe's test card `4242 4242 4242 4242`: order lands in the admin, both emails arrive, stock drops, refund shows.

## 3. Decisions for Ben / Charlee

- Her Instagram and TikTok profile links (footer icons currently go to the platforms' home pages).
- 13 old GHL orders are still marked unfulfilled. Were they all sent? If so, mark them fulfilled in bulk.
- Stripe's own receipt emails: turn off (Stripe → Settings → Customer emails → Successful payments) so customers get one confirmation, not two?
- Does she still do live sales? If so, she invoices from Stripe (Payment links / Invoices).

## 4. Cutover day

1. Day before: lower TTL on the `www` CNAME and the bare-domain A record in Squarespace.
2. Stripe: swap to the **live** secret key and add a live-mode webhook; set `SITE_URL=https://beadedbychar.com.au`.
3. Render: add custom domains `beadedbychar.com.au` and `www.beadedbychar.com.au`; remove `PUBLIC_NOINDEX`.
4. Squarespace DNS: point `www` and the bare domain at Render as Render instructs. **Leave MX and Google TXT records alone.**
5. Unpublish the GHL website / turn off its checkout.
6. Place one real order, refund it.
7. Send Charlee the admin link (`/admin`), her login, and point her at the Help tab.
8. Two weeks later: GHL snapshots and CSV exports done → cancel the agency → revoke the GHL token.
