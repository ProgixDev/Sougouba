# Sougouba — Handover

Situation as of **2026-11-17**. Read this first, then the docs listed at the end.

Sougouba is a multi-vendor local delivery marketplace with three roles in one mobile app — **customer**, **merchant** (commerçant) and **courier** (livreur) — plus a web back office. The app's UI is in French and English.

---

## 1. Repository layout

| Folder | What | Stack |
|---|---|---|
| `/` (root) | Mobile app (iOS + Android) | Expo SDK 57, Expo Router, NativeWind, Zustand, Mapbox, Stripe RN |
| `api/` | Backend API | NestJS + Fastify, Supabase (via PostgREST / `supabase-js`), Stripe Connect, Expo push, OpenAI |
| `admin/` | Super-admin back office + merchant portal | Next.js 15 |
| `web/` | Marketing landing page | Next.js |
| `api/drizzle/*.sql` | Database migrations (folder name is historical — Drizzle is uninstalled) | Plain SQL, applied to Supabase |
| `docs/` | Plans, progress logs, the contract (`Devis contractuel…pdf`) | |
| `CDC Sougouba.pdf` | Client's requirements addendum | |

`/ios` and `/android` are **generated** (`npx expo prebuild`) and are git-ignored.

---

## 2. Current status

### Done and working (test phase)
- **Mobile app** wired to the real API for all three roles: browse, cart, Stripe checkout (test mode), promo-code field, orders, loyalty/referral, favorites, merchant shop + catalogue + order handling, merchant registration documents, courier onboarding, dispatch, live GPS tracking on a Mapbox road route, proof of delivery (PIN / photo / signature), courier payouts screen.
- **Auth**: passwordless email code (our own API + Nodemailer), Google sign-in (Supabase PKCE), Apple sign-in (native).
- **API** deployed on Vercel: **https://sougouba-api.vercel.app** (Vercel project `sougouba-api`, root directory `api/`, built as a container from `api/Dockerfile.vercel`). Crons: weekly payouts (Fri 07:00 UTC), daily retention (08:00 UTC) — see `api/vercel.json`.
- **Database**: Supabase project `wyjkaiquugoblvvzpjnq`, 35 migrations applied, RLS + column grants audited.
- **Super-admin back office** (`admin/`) reads the real API (approval queues, disputes, courier issues, users, settings, stats).
- **Push notifications** (Expo push → FCM/APNs) and **AI support assistant** (`api/src/support/`, OpenAI Responses API) are built in code.
- **Receipts** (`api/src/orders/receipts/`, CDC module 04): a paid order emails the shopper a receipt (HTML body + PDF attachment, in French or English), a refund emails a refund notice, and the same PDF opens from the order screen in the app and from the order page in the back office, which can also resend it (audited as `order.receipt_resend`). The PDF is drawn on demand from the order's own snapshot — nothing is stored but `orders.receipt_number` and `orders.receipt_emailed_at` (migration `api/drizzle/0051_order_receipts.sql`, applied to the database on 2026-11-24 with `supabase db query --linked`; like `0036`–`0050` it has no row in `supabase_migrations.schema_migrations`). Sougouba's own legal identity on the receipt comes from the `PLATFORM_*` variables in `api/.env.example`; an empty one prints nothing.
- **Merchant subscription** (`api/src/billing/subscriptions.service.ts`, CDC addendum §05): the 70 $/month is billed by Stripe Billing. The merchant subscribes from their profile through Stripe's hosted checkout and manages the card, invoices and cancellation in Stripe's portal; Stripe charges, retries and emails the invoices. The API keeps a copy of the standing in `merchant_subscriptions`, refreshed from Stripe on every webhook and whenever the merchant opens the screen (migration `api/drizzle/0052_merchant_subscription_billing.sql`, applied 2026-11-24). **Nothing stops an unsubscribed or overdue shop from selling** — that rule is the client's to decide. Deleting a merchant account cancels the subscription.
- **Merchant portal on the web** (`admin/` → `/merchant`, CDC module 03 « tableau de bord commerçants (web et mobile) »): a shop owner signs in with the same email code as the app and manages the shop from a computer — **Produits** (list, search, by shelf, on/off sale from the list, create/edit/delete with photo upload, sale price, stock, tags, nutrition), **Boutique** (cover photo, name, specialty, lead time, halal badge, opening hours, shelves « rayons », monthly subscription through Stripe), **Codes promo** (create, usage, end early), beside the existing overview, orders and statements. No new API: it calls the `/vendors/me/*` routes the mobile app uses (`admin/lib/api/merchantCatalog.ts`, `merchantBilling.ts`), so both obey the same rules. Shelves can be added, renamed and removed here — the app has no screen for that. An edit sends only the fields that changed. French only, like the rest of the back office.
- **Ending an order early** (`api/src/orders/order-cancellation.service.ts`, migration `api/drizzle/0054_order_cancellation.sql`, applied 2026-11-24): one cancellation path for four actors. The **shopper** cancels while the shop has not accepted (`POST /orders/:id/cancel`, a reason from a list); the **shop** while it holds the bag (unchanged route, but it now refunds — it used to be a bare status change that left the order paid); the **back office** at any step before delivery (`POST /admin/orders/:orderId/cancel`, free-text reason, audited as `order.cancel`, permission `orders.refund`); the **system** when no courier takes a packed order. Every cancellation returns the stock, the points spent and the coupon use, releases the courier, refunds the whole payment through Stripe and notifies everyone still involved. Cancel first, refund second: if Stripe refuses, the order stays cancelled, the log says `REFUND IT FROM THE BACK OFFICE`, and the API answers `refund: 'failed'`. A **courier hands a run back** before pickup (`POST /couriers/me/runs/:orderId/release`, reason from a list): the order returns to dispatch and is never offered to them again; every courier who held an order is kept in `delivery_releases`. **No courier found** (`stalled-orders.service.ts`, a sweep every minute): after `no_courier_alert_min` (15) staff are emailed at `STAFF_ALERT_EMAIL` and the order is listed at the top of the back office's Commandes page; after `no_courier_cancel_min` (60, 0 = never) it is cancelled and refunded. Both delays are in Paramètres. The sweep never touches an order waiting more than 24 h — those stay on the list for a person. Not covered: a courier who accepts and never shows up (staff cancel or the courier hands back), and paying a courier for a run cancelled after pickup (nothing is paid). There is still **no time limit on a shop that never confirms** — not built, pending a decision.
- **A shop that never answers** (`sweepUnanswered` in `api/src/orders/stalled-orders.service.ts`, migration `api/drizzle/0055_shop_confirmation_timeout.sql`, applied 2026-11-24): the shopper pays when ordering, so an order waiting at `pending` is money held. After `shop_confirm_remind_min` (3) the shop gets one reminder push saying how long it has left; after `shop_confirm_cancel_min` (10) the order is cancelled and refunded in full through the same path as every other cancellation, with `cancelled_by = system` and `cancel_reason = shop_no_response`, and both sides are told why. Both delays are in Paramètres (0 switches either off). Same order of magnitude as the large platforms: Uber Eats cancels an unaccepted order after about 12 minutes, Deliveroo and SkipTheDishes after 10. The sweep runs once a minute and never acts on an order older than 24 h; those are listed at the top of the back office's Commandes page (`GET /admin/orders/awaiting-shop`). Not built: pausing a shop automatically after repeated misses, and refusing orders to a shop that is closed — the API still accepts them, and the timer is what ends them.
- **A courier who accepts and never comes** (`sweepLatePickups` in `api/src/orders/stalled-orders.service.ts`, migration `api/drizzle/0056_courier_no_show.sql`, applied 2026-11-24): accepting a run takes the order out of dispatch, so a courier who then never reaches the shop held it for good. The clock is the courier's own estimate, `accepted_at + pickup_eta_min`. `courier_late_remind_min` (5) past it the courier gets one reminder push — pick it up or hand it back; `courier_late_release_min` (15) past it the run is taken back through `delivery_release` with reason `no_show`, the courier is told, and the order returns to dispatch (never to that courier). A run with an open courier issue is never taken back automatically. If nobody else takes the order, the no-courier sweep handles it, its clock restarted from the take-back. Both delays are in Paramètres (0 switches either off); runs the timer left alone are listed on the Commandes page (`GET /admin/orders/late-pickups`). Not built: the other half — a courier who picked up and never delivers. The bag is in their hands, so no timer can reassign it; it needs staff, and there is no alert for it yet.
- **No orders to a closed shop** (`quote` in `api/src/orders/orders.service.ts`, `api/src/orders/shop-hours.ts`; no migration): the two steps before money moves — `POST /orders/quote` and `POST /orders/payment-intent` — refuse a shop that is closed right now (`public.is_open`, the posted hours on the database's clock in Montréal time) with a 409 and a French sentence saying when it reopens. The order write after payment does **not** re-check: a shopper who paid at 20:59 for a shop closing at 21:00 gets their order. In the app a closed shop can still be browsed; add-to-cart is disabled on its cards, menu rows and product page, and checkout keeps the cart but disables paying, with the reopening time. An older app build still gets the refusal, as the error under the pay button. A shop with no hours on file reads as closed and cannot be ordered from (all 13 approved shops have hours as of 2026-11-24). Not built: a last-order cutoff before closing, a "pause my shop" switch, ordering for later.
- **Search suggestions** (`components/customer/SearchSuggestions.tsx`, `api/src/catalog/search-suggestions.service.ts`, CDC module 02 « suggestions »; migration `api/drizzle/0057_search_suggestions.sql`, applied 2026-11-26 with `supabase db query --linked`; like `0036`–`0056` it has no row in `supabase_migrations.schema_migrations`): while the search field has the keyboard, a panel replaces the results. Empty field: this phone's recent searches (kept on the device, cleared on sign-out) and the current best sellers. Two letters or more: « Rechercher … », then matching categories (matched on the phone, in the app's language), shops by name or specialty (tap opens the shop) and product names or tags (tap searches). `GET /search/suggestions?q=` is public and answers `{ vendors, terms }` from `search_suggest`, ranked prefix → word start → inside a word (three letters at least). The same migration makes the product search ignore accents, hyphens and apostrophes (« epices » finds « Épices », « cote d ivoire » finds « Côte-d'Ivoire »). **Sized for the catalogue after launch**: the folded text of each product is kept in a generated column, `products.search_doc` (name and tags, written by the database), with a trigram index, so a call folds only the letters typed. On 30 000 products and 300 shops (local Postgres 16) a suggestion went from about 200 ms to 4–10 ms and a search from about 80 ms to under 12 ms. The API keeps each answer 60 s in memory (same letters, same answer for everyone; simultaneous askers share one database call) and marks it `Cache-Control: public, max-age=60`; the app asks 300 ms after the last letter, keeps answers 5 minutes, sends its token so the rate limit counts per account rather than per carrier IP, and only searches the catalogue once the panel closes. The accent-blind search is live for every app version; the panel needs the API deployed with this route (an app talking to an API without it treats the 404 as “nothing to suggest”) and an app update. Not built: typo correction, popular searches from a log, accent-blind matching on the shop list's own `?q=` (`/vendors`).
- **Sized for launch traffic** (2026-11-26; figures from 30 000 products and 300 shops on a local Postgres 16):
  - **Rate limiting** (`api/src/common/rate-limit.ts`, `api/src/app-factory.ts`). A request is counted against its account when its token *verifies* (same keys and issuer as the auth guard) and against its address otherwise; a made-up token used to get a budget of its own on public routes. The app now sends its token on public reads too (`knownAccessToken` in `lib/supabase.ts`, without waiting for the session), so shoppers behind one carrier address no longer share a budget. ⚠️ **`TRUST_PROXY_HOPS` must be set on the API host**: behind a proxy (Render, Vercel, nginx) every visitor otherwise has the proxy's address, and everything without a token — the 10 sign-in codes a minute of `/auth` included — is one budget for the whole platform. The server logs the likely value the first time it sees a forwarded request while it is 0. With more than one API instance set `REDIS_URL` so they share counters (a failed Redis lets requests through uncounted rather than failing them).
  - **Product lists** (migration `api/drizzle/0058_product_page_top_n.sql`, applied 2026-11-26 — inside the same transaction, 5 664 calls on the live catalogue were compared with the function it replaced: 0 different): `product_page` numbered and sorted every matching product to return twenty. It now sorts only ids and keys with a limit, reads the default order straight from an index on `(created_at, id)`, and returns the same answers (600 filter/sort/page combinations compared byte for byte). A page of the unfiltered catalogue: about 50 ms → 8 ms, and 24 → 315 pages a second with four clients; sorted by price or name about 20 ms where it was 53 and 75.
  - **More than 100 shops**: `getVendors`, `getVendorsByType` and `getVendorsByCategory` (`data/api/vendors.ts`) asked for one page of 100 and called it the whole list; past that, products of the other shops lost their shop name on cards. They now follow the pages to the end. Still limited: the home screen's own sample (`useProducts`) is the first 100 products.
- **Merchant statements** (`api/src/billing/statements/`, CDC module 04 « facturation »): on the 1st of each month every shop with an order delivered or a refund issued the month before gets a statement — sales, commission, what Stripe already paid out, and the balance still owed — frozen in `merchant_statements`, numbered `RM-000123`, emailed as a PDF. The month in progress is shown live. Visible in the merchant app (Profil → Relevés mensuels), the merchant web portal and the back office merchant page. Each paid order now records its commission and what Stripe sent the shop (`orders.commission_cad`, `merchant_paid_cad`). Only orders with a real payment count; migration `api/drizzle/0053_merchant_statements.sql`, applied 2026-11-24. A past month is issued by hand with `POST /internal/cron/statements?period=YYYY-MM&email=0`. **It is a statement, not a tax invoice**, and it adds up under today's payment rules (delivery fee, taxes and discounts on the shop's side) — `balanceOf` in `statement.ts` is the one place to change when the client decides otherwise.
- **OTA updates** via EAS Update (`npm run update:prod`, iOS only for now).
- **TestFlight** build 1.0.0 (6) was submitted 2026-10-16; later builds/OTAs went out after that.

### Test-phase shortcuts — removed from the code
`ALLOW_FIXED_TEST_OTP`, `ALLOW_DEMO_SELF_APPROVAL` and `ALLOW_DEMO_RUNS` no longer exist, nor do the demo routes (`/couriers/me/demo-approve`, `/couriers/me/demo-run`, `/vendors/me/demo-approve`, `/vendors/me/demo-adopt`) and the app buttons that called them. In production the API **refuses to boot without SMTP**; the fixed code `000000` only exists in local development when `SMTP_HOST` is empty. Delete the three variables from the host's environment.

### Not finished
- **Email**: Resend SMTP (`smtp.resend.com`, domain `sougouba.ca` verified). From Render use `SMTP_PORT=2587` — sends on 587 hung for 60 s+.
- **Coupons**: the checkout field works, but **nothing can create a coupon** (no admin endpoint/UI; rows only via SQL). Coupon rules in `CouponsService` are assumptions not yet confirmed by the client.
- **Stripe Connect payouts**: accounts are created on Accounts v2 and onboarding works; the full chain (paid order → 12 % application fee → weekly courier transfer → refund) has not been walked end-to-end in Stripe.
- **Receipts — limits**: the receipt prints the taxes the order was charged, and the pricing engine taxes every product at 14.975 % (`api/src/orders/pricing.ts`) — basic groceries are zero-rated in Canada, so the tax rules need an accountant before launch. Product names written only in a non-Latin script print as a dash in the PDF (the email shows them). The merchant's monthly statement / commission invoice ("facturation", phase 2) is not built.
- **AI assistant** answers 503 / "bientôt disponible" until `OPENAI_API_KEY` is set.
- **Apple Pay**: no merchant ID registered yet. Google Pay disabled.
- **Android**: not published to Google Play; OTAs are published for iOS only.
- **Admin and web** are not deployed anywhere.
- **Production hosting**: the plan in the contract is a VPS at delivery; `api/Dockerfile.vercel` is the same image for both (`docker build -f Dockerfile.vercel .`). On a VPS the in-process schedulers run (no `VERCEL=1`).
- **Phase 10 gaps**: no Sentry/logging, no load test, no staging; rate limiting counts in each instance's memory unless `REDIS_URL` is set (needed with more than one instance) and needs `TRUST_PROXY_HOPS` behind a proxy; dispatch and payout schedulers assume a single instance; referral phone verification not enforced; no CI check for schema drift.
- **Mapbox**: one `sk.` token is used both as the native download token and the server geocoding token — create a dedicated server token.

---

## 3. Run it locally

Requirements: Node 22, Xcode (iOS), Android Studio (Android), `npm i -g eas-cli`.

```bash
# Mobile app (root)
npm install                 # runs patch-package (patches/)
cp .env.example .env        # fill in values
npx expo prebuild           # regenerates ios/ and android/
npx expo run:ios            # or run:android
npm run verify              # typecheck + logic/seed/i18n/contrast checks

# API
cd api && npm install
cp .env.example .env        # fill in values
npm run start:dev
npm test                    # unit tests (vitest)
npm run verify:orders       # live gates against Supabase/Stripe (also :stripe :admin :catalog :dispatch :registration)
npm run db:seed             # seed demo data (db:seed:reset to wipe + reseed)

# Admin back office
cd admin && npm install && cp .env.example .env.local && npm run dev

# Landing page
cd web && npm install && npm run dev
```

Tip: Debug + Metro can be flaky in the simulator; a Release build (`npx expo run:ios --configuration Release`) is more reliable for testing.

---

## 4. Accounts & access (handed over by invitation)

| Service | Identifier | Used for |
|---|---|---|
| GitHub | `Mohamedbza/sougouba` | Code + CI (`.github/workflows/api.yml`: lint, typecheck, tests on `api/`) |
| Supabase | project `wyjkaiquugoblvvzpjnq` | Postgres, Auth (email/Google/Apple), Storage buckets |
| Vercel | project `sougouba-api` | API hosting, env vars, crons — **being transferred, see §6** |
| Expo / EAS | owner `mohameddev7`, project `e6a4ddb9-c49d-45c6-a211-d34bc3f28113` | Builds, submit, OTA updates, **build-time env vars (`production` environment)** |
| Apple | Team `89884BGNZR`, bundle id `pro.progix.sougouba`, App Store Connect app `6799634702` | TestFlight / App Store. Individual membership: only the account holder can manage certificates & identifiers |
| Stripe | test account `acct_1UOJkMGYR2OmhlN6` | Payments, Connect, webhook → `https://sougouba-api.vercel.app/webhooks/stripe` (`payment_intent.succeeded`, `payment_intent.payment_failed`) |
| Mapbox | account owning the tokens | Maps, Directions, geocoding |
| Firebase | project behind `FIREBASE_SERVICE_ACCOUNT_JSON` | Android push (FCM) |
| OpenAI | API key | Support assistant |
| Google Cloud | OAuth client used by Supabase Google provider | Google sign-in |

Per the contract, the client owns the Apple Developer, Google Play and Stripe accounts; we get developer access.

---

## 5. Secrets (never committed — received separately)

Each folder has a `.env.example` with every variable name.

- **`.env`** (mobile): `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`
- **`api/.env`**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MAPBOX_SECRET_TOKEN`, `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`), `FIREBASE_SERVICE_ACCOUNT_JSON`, `EXPO_ACCESS_TOKEN`, `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `CRON_SECRET`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `REDIS_URL` (optional), and the test flags above
- **`admin/.env.local`**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **`credentials/AuthKey_*.p8`**: App Store Connect API keys used by `eas submit` (path referenced in `eas.json`)

⚠️ `EXPO_PUBLIC_*` values are **inlined at build time**. The values in the EAS `production` environment are what the app actually ships with — changing one needs a new EAS build (or an OTA with `--environment production`).

---

## 6. Vercel migration (project transfer)

The current owner will **transfer** the `sougouba-api` project to your Vercel account/team. Before:

1. Have a Vercel **team** with a valid payment method (the API runs as a container and has crons; check your plan's limits).
2. Either invite the current owner to your team as a member so they can pick it in **Settings → General → Transfer Project**, or accept a transfer request code they generate (valid 24 h).

What moves with the project: deployments, env vars, crons, Git link, domains (`sougouba-api.vercel.app` stays the same), settings.
What does **not**: integrations (re-add), logs/monitoring history, log drains.

After the transfer, check:
- [ ] **Settings → Environment Variables**: all API variables present (list in §5), including `CRON_SECRET`.
- [ ] **Settings → Git**: connected to `Mohamedbza/sougouba`, root directory `api/`. If not, reconnect (or deploy with the CLI from `api/`).
- [ ] **Crons** tab shows `/internal/cron/payouts` and `/internal/cron/retention`.
- [ ] **Deployment Protection** stays **off** for production (the mobile app must reach the API).
- [ ] `curl https://sougouba-api.vercel.app/health` answers.
- [ ] Locally: `cd api && vercel link` to your team, then `vercel env pull` (the old `api/.env.local` OIDC token belongs to the previous account).
- [ ] If the URL ever changes: update `EXPO_PUBLIC_API_URL` in EAS (+ rebuild), `NEXT_PUBLIC_API_URL` for admin, the Stripe webhook endpoint URL, and the Stripe Connect return URL.

---

## 7. Before going live — checklist

- [x] Test-phase switches and demo buttons removed from the code — delete the leftover env vars on the host
- [ ] Stripe: switch to live keys, live webhook + new `whsec_`, finish Connect live verification
- [ ] Apple Pay merchant ID (and Google Pay if wanted)
- [ ] Subscription: point the Stripe webhook at the API that is actually live (it still targets `sougouba-api.vercel.app`) and add `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `radar.early_fraud_warning.created`; turn on customer emails for invoices in Stripe; decide whether an unpaid subscription suspends a shop; decide TPS/TVQ on the fee (no tax is charged today)
- [ ] Receipts: deploy the API, the back office and an app update; set `PLATFORM_LEGAL_NAME`, `PLATFORM_LEGAL_ADDRESS`, `PLATFORM_GST_NUMBER`, `PLATFORM_QST_NUMBER`, `SUPPORT_EMAIL` on the API host; register the sending domain with Apple's private email relay, or receipts to "Hide My Email" accounts bounce
- [ ] Coupon creation in the admin + confirm coupon rules with the client
- [x] Merchant portal on the real API + real auth (email-code sign-in, `/vendors/me/*`)
- [ ] Dedicated Mapbox server token; rotate every key that was shared during handover
- [ ] Deploy admin (and web), decide final API host (VPS per contract)
- [ ] Google Play release; enable Android OTA (`--platform` in `update:*` scripts)
- [ ] Rate limiting: set `TRUST_PROXY_HOPS` on the API host (read the value from the warning in the server log, then check that two phones on different networks get separate `x-ratelimit-remaining` counts); `REDIS_URL` if scaling beyond one instance
- [ ] Sentry/logging

---

## 8. Rules and traps (learned the hard way)

- **Supabase "Confirm email" must stay ON.** Our email-code gate relies on it; to stop direct sign-ups, disable "Allow new users to sign up" instead.
- **Every new `public` SQL function is callable by `anon` over `/rpc/<name>`.** Each migration must `revoke execute … from public, anon, authenticated` and grant only `service_role` — and verify by actually calling it as anon.
- **RLS scopes rows, not columns.** Supabase's default grants make every column writable; audit column grants with every new policy (this bug appeared several times: users making themselves admin, merchants self-approving).
- Enforce cross-column relationships in the DB (composite FKs / checks), not only in services.
- **No DB TCP connection**: the API talks to Supabase only through PostgREST with the service-role key; transactions are `plpgsql` functions called via `.rpc()`. Regenerate `api/src/db/database.types.ts` after schema changes.
- On Vercel there is no long-lived process: `VERCEL=1` switches schedulers to the `/internal/cron/*` routes (bearer `CRON_SECRET`); dispatch is "nudged" on relevant requests. Don't add an every-minute cron — it kept the container awake and cost a lot.
- API latency on Vercel (~1 s/request, 3 s cold boots) comes from the container platform, not the code or Supabase.
- OTA updates use a **fingerprint** runtime: any native change (new native dependency, plugin change in `app.config.ts`) needs a new EAS build.
- After changing App ID capabilities on Apple, the next EAS build must regenerate the provisioning profile.
- Moving the app to another Apple team changes every Apple user's `sub` — needs Apple's user-migration step if real users exist.

---

## 9. Where to read more

- `docs/PROGRESS.md` — mobile app build log, design decisions, route map
- `docs/BACKEND-BUILD-PHASES.md` — backend plan, architecture decisions, data model
- `api/PROGRESS.md` — API build log, migrations, security findings (code snippets before 2026-09-08 describe the old Drizzle version)
- `docs/Devis contractuel · Progix — Sougouba.pdf` — the contract (scope, budget, ownership, 90-day support)
- `CDC Sougouba.pdf` — requirements addendum (monetization, admin scope)
- `git log` — commit messages are detailed and explain the why
