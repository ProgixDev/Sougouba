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
- **Phase 10 gaps**: no Sentry/logging, no load test, no staging; rate limiting is in-memory (per instance → needs Redis with >1 replica); dispatch and payout schedulers assume a single instance; referral phone verification not enforced; no CI check for schema drift.
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
- **`api/.env`**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MAPBOX_SECRET_TOKEN`, `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`), `FIREBASE_SERVICE_ACCOUNT_JSON`, `EXPO_ACCESS_TOKEN`, `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`, `CRON_SECRET`, `CORS_ALLOWED_ORIGINS`, and the test flags above
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
- [ ] Sentry/logging, Redis for rate limiting if scaling beyond one instance

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
