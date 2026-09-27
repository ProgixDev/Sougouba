# Sougouba Backend — Build Phases

Companion to the mobile app (`app/`, `data/`) and to `docs/PROGRESS.md`. Those capture
*what the frontend prototype already does*. This document is *what the real backend
needs to do to replace the mock `data/api/*` layer*, in what order, and how to know
each phase is actually finished.

**Stack**: NestJS on the Fastify adapter (`@nestjs/platform-fastify`), Supabase
(Postgres + Auth + Storage + Realtime) as the managed data/identity layer, Stripe
Connect for payments and merchant payouts. Built as a separate repository, and
moved into this one as `api/` on 2026-09-27 (history preserved). Older sections
below still say `sougouba-api/` — read it as `api/`.

**Sources this plan is grounded in** (read in full before writing this doc, 2026-08-30):
every file under `data/`, `data/api/`, `lib/`, `store/`, `hooks/`, and the customer/
business/courier/auth screens under `app/`; `CDC Sougouba.pdf` (addendum v1.1 — the
short functional-delta spec); `docs/Devis contractuel · Progix — Sougouba.pdf` (the
12-page commercial quote — the *full* contracted scope, of which the mobile prototype
is one slice); `docs/PROGRESS.md` (confirms the mobile app is "100%-frontend... no
backend, no real auth, no real payments"). See memory notes `cdc-backend-requirements`
and `devis-contract-scope` for the condensed facts pulled from the two PDFs.

---

## Rules that apply to every phase

1. **The mock is the functional spec; the two PDFs are the business-rule spec.**
   Where the running app already encodes a rule precisely (tax formula, delivery fee
   bands, courier pay, order status transitions, loyalty math), that behaviour is
   correct and gets ported, not reinvented. Where a PDF is explicit and the app either
   diverges or doesn't implement something at all (admin back-office, Stripe Connect,
   AI assistant, promo coupons), the PDF wins and gets flagged as new work.
2. **Preserve the `data/api/*` function surface wherever the underlying capability is
   unchanged.** The mobile app already routes every read/write through one typed
   module per domain (`ordersApi`, `vendorsApi`, `loyaltyApi`, …). Cutting the frontend
   over should mostly mean swapping what's *inside* those files (local mock →
   `fetch`/HTTP client) rather than rewriting screens. Call out explicitly, per phase,
   anywhere a signature has to change (new required fields, new async steps like a
   Stripe confirmation).
3. **Every phase ships something callable and testable**, even before the mobile app
   is wired to it — Swagger/OpenAPI docs plus a Postman/Insomnia collection or
   `*.http` file per phase, and integration tests against a real (local or staging)
   Supabase project, not mocks of Supabase itself.
4. **Money, identity, and delivery proof are never trusted from the client.** The
   mock already does this right in several places (`createOrder` recomputes totals
   server-side, `debitForRedemption` only ever receives a value the server itself
   clamped) — the rule generalises: price, discount, commission, and PIN all come
   from the server's own state, never an argument the client supplied as fact.
5. **RLS (Postgres Row-Level Security) is the last line of defence, not the only
   one.** NestJS guards do the real authorization; RLS policies on every table exist
   so a bug in a guard, or a future direct-Supabase client call, still can't leak
   another customer's addresses or another merchant's orders.
6. **Anything simulated client-side today (courier position, route geometry, delivery
   PIN, ETA) is flagged where it appears and gets a named phase that replaces it with
   the real thing** — a live GPS feed, a Directions API call, a server-generated
   secret. Nothing here silently keeps faking something the client is paying for.

---

## Status

| Phase | State |
|---|---|
| 0 · Foundations & infra | **Done** (2026-08-30) — see `api/PROGRESS.md` |
| 1 · Identity & accounts | **Done** (2026-08-30) — API side only; mobile app not yet wired to real Supabase Auth |
| 2 · Catalog | **Done** (2026-09-03) — API side only; mobile app not yet wired |
| 3 · Cart → checkout → orders → payments | **Done and walked** (2026-09-08) — `verify:stripe` 12/12 on the payment path, `verify:orders` 17/17 on the order-writing half, including the rollback when a line sells out mid-checkout |
| 4 · Loyalty, referrals & coupons | **Done** (2026-09-03) — coupon *rules* still assumed, not confirmed |
| 5 · Courier, dispatch & live tracking | **Done** (2026-09-03) — straight-line ETAs until Mapbox Directions; scheduler is single-instance |
| 6 · Disputes & courier issues | **Done** (2026-09-03) — incl. the `admin` role and refunds |
| 7 · Money: merchant billing & courier payouts (Stripe Connect) | **Written** (2026-09-03) — still unexercised, but the blocker is now precise: **Connect is not enabled on the Stripe account**, so `accounts.create` is refused. Switch it on at dashboard.stripe.com/connect and re-run `verify:stripe` |
| 8 · Admin back-office API | **Done** (2026-09-03) — API only, as planned; audit log landed same day (`0028`) |
| 9 · Notifications & AI support assistant | Not started |
| 10 · Hardening, observability & launch | **Started** (2026-09-03) — rate limiting done, column-grant audit closed; logging/Sentry, load test, staging and deploy outstanding |

Code: `api/` in this repository — NestJS + Fastify, all 30 tables live
in Supabase project `wyjkaiquugoblvvzpjnq`, Storage buckets created, CI wired.
The identity (`profiles`, `addresses`, favorites) and catalog (`vendors`,
`products`, `categories`, sections, hours, registrations) domains have real RLS
policies; everything else still carries Phase 0's placeholder (RLS enabled, no
policies). `get_advisors(security)` reports zero WARN-level findings.

Every phase so far has been genuinely **booted and exercised**, not just
typechecked, and every single time that caught something no static check would
have:

- **Phase 1** — a missing Fastify Swagger dependency, and a dead
  `class-validator` pipe wired to nothing.
- **Phase 2** — a route-ordering bug (`/vendors/me` swallowed by `/vendors/:id`),
  and a real **privilege escalation**: with only RLS in place a merchant could
  self-approve their own shop over PostgREST, because RLS gates rows while
  Supabase's default grants hand `authenticated` table-wide UPDATE on every
  column. Fixed with column privileges (`drizzle/0009`), re-verified by re-running
  the attack. A follow-up review pass then found **seven more** real defects,
  including a cross-tenant inventory oracle and a `?q=%` that returned the whole
  catalogue.
- **Phase 4** — two bugs that `tsc` accepted: a Drizzle `insert().select()` that
  would have thrown on *every* coupon redemption, and a usage limit that did not
  limit anything (a counting subquery under READ COMMITTED lets two concurrent
  checkouts both take the last unit — demonstrated against the real database,
  then replaced with an atomic counter and re-verified).
- **Phase 6** — the Phase 2 escalation again, on a table nobody re-audited:
  **any signed-in user could `update profiles set role = 'admin'`** over
  PostgREST and become an administrator. Harmless while `role` only chose a home
  screen; critical the moment Phase 6 gave admins dispute resolution and Stripe
  refunds. Fixed with column grants (`drizzle/0022`) and re-verified by
  re-running the attack.
- **The class again, third time, a different shape** (`drizzle/0027`) — a
  merchant could insert into their *own* shop while pointing `section_id` at a
  competitor's aisle. Section ids are public (the storefront lists them to
  anonymous readers) and `GET /products?sectionId=` filters on the section
  independently of the vendor, so the planted row is served inside the other
  shop's aisle at a price its owner never set and cannot delete.
  `ProductsService.assertOwnedRefs` refuses this *correctly* — and that is the
  point: it guards the API and says nothing about PostgREST. Closed with a
  composite foreign key `(section_id, vendor_id)`, which beats a column revoke
  here because a revoke leaves INSERT open (how the attack lands) and takes
  legitimate re-shelving away from merchants.
- **Rate limiting** (Phase 10) — the 429 came back as a **500**.
  `@fastify/rate-limit` throws a plain `Error` with a `statusCode` property,
  which Fastify's own handler understands and this project's catch-all
  `HttpExceptionFilter` does not. The budget was enforced and the status was a
  lie; a client cannot back off from a 500.

The recurrence is the point: **RLS scopes rows and cannot scope columns, and
Supabase's default grants make every column writable.** Any table where a policy
is the only gate has this bug. Audit column grants alongside every new policy.

`0027` extends the rule one step: it is not only about *columns*. Wherever a
service method enforces a relationship between two columns — "this section
belongs to this vendor" — the database has to enforce it too, or the guarantee
holds only for callers who come through the API. Prefer a composite foreign key
or a check constraint over a service-layer assertion, and keep both.

The column-grant audit that `0024` began was re-verified live on 2026-09-03 and
holds: every write grant for `anon`/`authenticated` across couriers, orders,
deliveries, disputes, loyalty, coupons and payouts is zero, and only `profiles`
and `vendors` carry column-scoped UPDATE, each matching its migration exactly.

The pattern is consistent enough to be worth stating as a rule: **on this
project, static checks have never once caught the bug that mattered.** Full
detail and what is verified vs. merely written is in `api/PROGRESS.md` —
this file stays the phase-by-phase plan, that one is the build log.

**Waiting on**: ~~a real `DATABASE_URL`~~ (removed — see the data-layer note below),
**Connect enabled** on the
Stripe account and a **webhook signing secret** (both dashboard steps — see
Phase 7 in the table), a deploy target decision, the remaining open questions in
§"Confirm before Phase 0" below, and — per the devis — Apple Developer / Google
Play Console accounts the client owns (not blocking API work, but blocking store
publishing in Phase 10).

Two items have come **off** this list (2026-09-03):

- **`MAPBOX_SECRET_TOKEN`** never needed obtaining from anyone. The mobile
  repo's own `.env` already carried an `sk.` token as
  `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, and it geocodes. `POST /geo/coordinates` now
  answers with real coordinates for Montréal and Laval and refuses Toronto.
  Caveat in `.env.example`: that is nominally the *downloads* token for the
  native build, so rotating it for the mobile build would silently stop
  server-side geocoding. A dedicated server token before launch.
- **The Stripe test key** arrived, and Phase 3's gate was walked with it —
  `npm run verify:stripe`, 12/12, including the three `assertPaidBy` refusals
  (unpaid intent, cheaper intent replayed against a bigger basket, another
  shopper's intent) and the webhook signature accepted, forged, tampered and
  missing. The gate is a committed script, so it can be re-walked after any
  change to the payment path rather than being a thing that was true once.

`MAPBOX_SECRET_TOKEN` has come **off** this list (2026-09-03). It never needed
obtaining from anyone: the mobile repo's own `.env` already carries an `sk.`
token as `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, and it geocodes. `POST
/geo/coordinates` now answers with real coordinates for Montréal and Laval and
refuses Toronto — the first endpoint on this API verified end-to-end against a
real external service rather than through the MCP connection. One caveat
recorded in `.env.example`: that token is nominally the *downloads* token for
the native SDK build, so one secret is doing two jobs and rotating it for the
mobile build would silently stop server-side geocoding. A dedicated server
token before launch.

## The data layer changed (2026-09-08) — `DATABASE_URL` is gone

The longest-standing blocker on this plan was removed by changing the
architecture rather than by obtaining the password. **The API talks to Postgres
through PostgREST now** (`supabase-js` + the service-role key); nothing in
`api/` opens a TCP connection.

The trade, stated plainly: `service_role` bypasses RLS entirely, so the app still
holds one god-mode secret — a different name, not a smaller blast radius. What it
bought is that the secret was one we already had, which is why this data layer
read its first real row that day, after eight phases in which **no query this API
issued had ever reached a database**.

What it cost, and what anyone extending this needs to know:

- **19 transactions became 34 `plpgsql` functions.** PostgREST is one statement per
  request, so anything that must land together moved into SQL — order placement with
  its stock decrements and coupon claim, every audited admin decision with its log
  entry, the dispatch accept, the delivery completion with its proof.
- **Query-level type safety is gone.** The caller asserts what a `select` returns; a
  column renamed in the database and not in the code fails at runtime. That is why
  the five committed verification gates matter more than they did.
- **Four `Date`-vs-string bugs surfaced**, none visible to the type-checker:
  `postgres.js` parsed `timestamptz` into `Date` objects and PostgREST returns JSON
  strings, so every date comparison in the codebase was silently wrong until fixed.
- **⚠️ A new attack surface, by default.** PostgREST publishes every function in
  `public` as `POST /rpc/<name>`, and a new function grants EXECUTE to PUBLIC —
  which includes `anon`. Every function must revoke `public, anon, authenticated`
  and grant only `service_role`, verified by attacking it. This is the fifth
  appearance of the "a guard protected the route and said nothing about the
  PostgREST path" class on this project, and the first one the architecture creates
  for free rather than by oversight.
- **Nothing checks schema drift any more.** CI's `drizzle-kit generate` check
  compared schema files to a migration snapshot and both sides are gone. The check
  that would work is a live introspection diff, which needs a Supabase token in CI.
  Recorded as a real gap in `.github/workflows/ci.yml`.

Migrations still go through the Supabase MCP, exactly as they did before —
`apply_migration` never needed a connection string, and all 30 original migrations
were applied that way.

**Still true, and now the critical path**: the mobile app is not wired
to any of it. Every screen still reads the mock `data/api/*` layer. The cutover
is deliberately cheap by design (see "Frontend migration strategy" below), but
it is real work that has not started, and no phase's review gate can be walked
end-to-end from the app until it does.

---

## Architecture decisions

### Repo & framework

- New repo `sougouba-api/`, NestJS CLI-scaffolded, Fastify adapter from the start
  (`NestFactory.create<NestFastifyAdapter>`) — don't bring in Express and swap later.
- Validation: `nestjs-zod` (re-using the exact same Zod schemas the mobile app
  already has in `lib/validation/*.ts` wherever the shape matches — e.g. postal code
  /city cross-validation, courier insurance rules — is both less work and a
  guarantee the two layers agree) with `class-validator` as a fallback only where
  Zod's Nest integration is awkward (file uploads, multipart).
- API docs: `@nestjs/swagger`, generated from the same DTOs, served at `/docs` in
  every non-production environment.
- One module per domain, named to match the mobile app's own split so the mapping
  is obvious at a glance: `auth`, `catalog` (vendors+products+categories),
  `orders`, `loyalty`, `courier`, `dispatch`, `disputes`, `merchant` (analytics +
  billing), `admin`, `notifications`, `support` (AI assistant).

### Data layer

- **Direct Postgres access via an ORM, not the Supabase JS client, for anything
  beyond simple CRUD.** Supabase's PostgREST-backed client is fine for the mobile
  app talking to Storage/Realtime/Auth directly, but the analytics aggregations
  (`lib/analytics.ts`'s `comparePeriods`, `lib/courierAnalytics.ts`'s
  `summariseRuns`) need real SQL (`GROUP BY`, window functions) that a REST-over-
  Postgres client makes awkward. **Recommendation: Drizzle ORM** — typed schema,
  lightweight, fast on Fastify's performance-conscious footing, plain SQL escape
  hatch for the aggregation-heavy endpoints. Prisma is the alternative if the team
  prefers its migration tooling; either works against Supabase's connection string.

  > **Superseded 2026-09-08.** This recommendation was followed, then reversed: the
  > data layer is `supabase-js` over PostgREST. The paragraph above was right about
  > the *problem* — "the analytics aggregations need real SQL that a REST-over-
  > Postgres client makes awkward" is exactly what happened, and the answer is that
  > all of it moved into `plpgsql` functions called over `.rpc()`. Nineteen
  > transactions and every aggregate now live in SQL rather than in an ORM. See
  > "The data layer changed" above.
- Migrations live in the API repo as plain `.sql` under `drizzle/` (the directory
  keeps its name; the tool that made it is gone), applied to Supabase through the
  MCP's `apply_migration` — **not** hand-edited in the Supabase dashboard, so
  schema history is in git.
- Supabase itself is used for: **Auth** (email/password + Google + Apple OAuth,
  password reset emails — replaces every fake auth path in `data/api/auth.ts` and
  `app/(auth)/forgot-password.tsx`), **Storage** (product/vendor images, merchant
  legal documents, delivery proof photos — all currently nonexistent), and
  **Realtime** (dispatch offer broadcast, live courier position — replaces the
  client-side polling in `hooks/useDispatchEngine.ts` and the pure-function
  simulation in `lib/courierRoute.ts`).

### Auth architecture (specifically)

- The mobile app's Supabase client signs in/up/resets-password directly against
  Supabase Auth — NestJS does not proxy raw credentials. NestJS's job is
  **authorization**, not **authentication**: a Fastify/Nest guard validates the
  Supabase-issued JWT (via Supabase's JWKS endpoint) on every protected route and
  attaches `{ userId, role }` to the request.
- A Postgres trigger (`on auth.users insert`) creates the matching row in a
  `public.profiles` table — this is where `User`'s app-specific fields live
  (`fullName`, `role`, `vendorId`, `courierId`, `referredBy`, addresses via a
  child table). `role` starts `null`, exactly like the mock, and is set through a
  dedicated `PATCH /me/role` endpoint mirroring `mockSelectRole`.
- This single decision fixes three "fake" things the research surfaced at once:
  real password reset (Supabase sends the email), real Google/Apple OAuth (Supabase
  handles the token exchange), and a real session (JWT refresh, not a Zustand store
  with no expiry).

### Frontend migration strategy

Every screen already imports from `@/data/api` (`import { ordersApi } from
'@/data/api'`), never from the mock table files directly. That means the cutover
per domain is: **replace the inside of `data/api/<domain>.ts` with HTTP calls to
`sougouba-api`, keep the exported function names and return types identical wherever
possible.** Concretely:

- Add an `apiClient.ts` (axios or `fetch` wrapper) that attaches the Supabase JWT
  and points at `EXPO_PUBLIC_API_URL`.
- Each `data/api/<domain>.ts` file's body changes from `table.rows().filter(...)` to
  `apiClient.get('/vendors', { params })`; the function signature and the shape of
  what it resolves to stay the same unless a phase below says otherwise.
- Screens, hooks (`useCartDetails`, `useCustomerStats`, …), and Zustand stores that
  hold *client-only* state (theme, cart-in-progress, dispatch UI state) are
  **unaffected** — only the seven files under `data/api/` and the pure-logic files
  under `data/` that currently *compute* something the server should now compute
  authoritatively (`data/taxes.ts`, `data/deliveryPricing.ts`, `data/loyalty.ts`,
  `data/courierPay.ts`) get thinned to "call the API, use its answer" rather than
  deleted — the mobile app still wants an optimistic local preview (e.g. the
  checkout screen showing a tax estimate before the order round-trip completes).
- Explicit signature breaks, called out again per-phase below: `ordersApi.createOrder`
  gains a Stripe payment-confirmation step; anything that creates a `Vendor`/
  `Product`/`Courier` with an image gains a separate upload call; `loyaltyApi` stays
  essentially identical (it was designed this session against exactly this kind of
  future swap).

### Data model — table inventory

Condensed; exact column types/constraints are a Phase 0/1 deliverable (Drizzle
schema files), not repeated here. Names follow the `Order`/`Vendor`/etc. shapes
already defined in `data/types.ts` almost verbatim — that file is close to a
ready-made ERD.

| Table | Notes |
|---|---|
| `profiles` | 1:1 with `auth.users`. `role`, `vendor_id`, `courier_id`, `referred_by`, `member_since`. |
| `addresses` | FK `profile_id`. `is_default` enforced unique-per-profile at the DB layer (the mock enforces this in JS in `account/addresses.tsx` — move it into a partial unique index or a trigger). |
| `favorites_products`, `favorites_vendors` | Join tables, replacing `useFavoritesStore`. |
| `categories` | Platform taxonomy — seeded, admin-editable later. |
| `vendors` | `status` enum (`pending/approved/suspended`), `registration` as a child table (`vendor_registrations`: neq, contact, mapaq, **plus new file references into Storage** — the mock only ever stored text fields here). |
| `vendor_sections`, `vendor_hours` | Child tables, ordered. |
| `products` | Incl. `nutrition` as a nullable JSON or child table, `tags` as `text[]`. |
| `orders`, `order_items`, `order_status_history` | Mirrors `Order`/`OrderItem`/`OrderStatusEvent` closely. `points_redeemed`/`points_discount_cad` columns already anticipated by this session's frontend work. |
| `order_deliveries` | 1:1 with a delivered/in-flight order — mirrors `OrderDelivery`, **minus** the derived-position fields (those are computed from live GPS pings now, not stored as a static route). |
| `delivery_proofs` | `method`, **real** storage-backed `image_uri`, note, timestamp. |
| `courier_locations` | New table (or Realtime presence channel, see Phase 5) — periodic lat/lng pings while `out_for_delivery`. |
| `disputes`, `dispute_replies`(or a `status`+`merchant_reply` pair like today) | Mirrors `OrderDispute`. |
| `courier_issues` | Mirrors `CourierIssue` — **plus a resolution path that doesn't exist in the mock at all** (Phase 8). |
| `couriers` | Mirrors `Courier`, incl. `insurance` as a child table. **Not** `payout` as a stored column — see `courier_payouts` below. |
| `courier_applications`, `merchant registration` (via `vendors.status='pending'` + `vendor_registrations`) | Approval queue source, read by Phase 8's admin API. |
| `dispatch_offers` | New — `orders`/`couriers`/`offered_at`/`expires_at`/`outcome`, replacing the client-only `useDispatchStore`. |
| `loyalty_transactions` | Direct port of this session's `LoyaltyTransaction` shape. |
| `platform_settings` | New — the admin-editable version of `data/loyalty.ts`'s constants (`POINTS_PER_CAD`, `MAX_REDEMPTION_SHARE`, `DOUBLE_POINTS_ACTIVE`, …), plus commission rate / subscription fee, singleton row or key-value. |
| `coupons`, `coupon_redemptions` | New — the "coupons promotionnels" half of loyalty the devis promises and nothing in the mobile app implements. |
| `merchant_subscriptions` | New — Stripe Connect account id, subscription status, commission ledger per order. |
| `courier_payouts` | New — Stripe Connect Express account id per courier, weekly Transfer batches (replaces `CourierPayout`'s plain-text bank transit/account — see Phase 7). |
| `support_conversations`, `support_messages` | New — the AI assistant's chat history, if kept server-side rather than ephemeral. |

---

## Confirm before Phase 0

Mirroring the two PDFs' own "à confirmer avec le client" caveats — these are
decisions that change schema/endpoint shape, so guessing wrong here is expensive
to unwind later:

1. **Merchant/courier registration document list** — both PDFs flag this as
   unconfirmed (ID, NEQ, MAPAQ permit is the *indicative* list). Needs a final
   list before Phase 1's Storage bucket rules and Phase 8's admin review UI can be
   built against it.
2. **In-app registration vs. web-redirect (CDC §02)** — the addendum's base spec
   sends merchants to a separate admin website to register; the mobile app already
   diverged from that and built it in-app. Does the real backend expose merchant
   sign-up as a mobile API endpoint (matching the app today) or does that flow move
   to the admin web app entirely? This changes whether Phase 1/2 need a public
   (unauthenticated-except-for-account-creation) `POST /vendors/apply` at all.
3. **Delivery pricing & courier pay basis** — both `data/deliveryPricing.ts` and
   `data/courierPay.ts` carry "confirm with the client" comments in the mock. Real
   rates before Phase 3/5 lock in a pricing service other things depend on.
4. **Is the admin back-office in scope for this backend engagement, or does it get
   its own separate frontend project later?** Phase 8 shipped (2026-09-03) as an
   **API surface only**, as this plan assumed. That assumption now looks right for
   a second reason: a Next.js admin app already exists in this repo at `admin/`,
   built against a localStorage mock deliberately shaped like these endpoints, so
   the remaining work there is swapping its `admin/lib/api/*` for real fetches
   rather than designing anything. **Still worth confirming who does that swap**,
   since the devis prices the "back-office administrateur" as part of the same
   contract and it is not part of the API repo.
5. **AI support assistant scope** — the devis says "Assistant IA de support client
   (OpenAI GPT)" with no detail beyond that line. Needs a scoping pass (what
   questions it answers, whether it can read order state, escalation to a human)
   before Phase 9 can be estimated properly — it's currently the least-specified
   line in the whole contract.
6. **Coupon rules — BUILT ON ASSUMPTIONS 2026-09-03, still unconfirmed.** "Coupons
   promotionnels" has zero detail anywhere, but Phase 4 built it rather than
   deferring it again: the feature already slipped through the whole mobile
   prototype once without anyone noticing it was in scope. The assumptions are
   listed in full in `CouponsService`'s doc comment in the API repo, and each is
   a one-line change if wrong. The ones worth putting to the client: discount
   applies to the **subtotal only**; `percentage` means a percent (15 → 15 %);
   **one coupon per order**; coupons **may** be combined with points, each
   computed against the original subtotal with the sum capped at it; and
   `usage_limit` counts across **all** customers, with no per-customer limit
   (the table has no column for one — that shape should not be invented before
   the rule is known).
7. **Single-vendor vs. multi-vendor cart — RESOLVED 2026-09-03: one vendor per
   order.** Confirmed with the client contact for this build; Phase 3's
   `POST /orders` takes a single `vendorId` and produces one order, one
   PaymentIntent, one delivery and one distance-band fee, matching the app as
   built. The reading is that the devis's "multi-commerces" describes a platform
   hosting many merchants rather than a cart mixing them — which is also how
   every comparable courier marketplace works, since one order is one pickup.
   **Worth re-confirming in writing with Salif Eric Sogodogo before launch**,
   since the line item is his, and a literal reading would mean a parent
   checkout-session table, per-shop delivery fees and partial-refund rules that
   nothing below builds. The original analysis follows.

   **Single-vendor vs. multi-vendor cart — a real divergence, not a wording
   nuance.** The devis's own budget line reads *"Panier & commandes
   multi-commerces"* (cart & **multi-vendor** orders, $800) — but the mobile app
   as built (`store/useCartStore.ts`, `VendorSwitchDialog`) deliberately enforces
   **one vendor per cart**: adding an item from a second shop triggers a "clear
   your cart?" confirmation rather than letting the two coexist. Nothing in either
   PDF or in `docs/PROGRESS.md` calls this out as an intentional scope cut — it
   reads like the single-vendor rule was a build-time simplification that never
   got reconciled against what was actually sold. This changes real schema shape:
   a multi-vendor cart needs an order-per-vendor split at checkout (one payment,
   several `orders` rows, or a parent "checkout session") instead of today's
   one-cart-one-order model that Phase 3 below assumes. Confirm which one is
   actually wanted before Phase 3's `POST /orders` shape is locked in — building
   single-vendor and later splitting it is a much bigger rework than starting
   from the right shape.

---

## Phase 0 · Foundations & infra

**Goal**: an empty-but-real backend — nothing user-facing yet, but every later
phase builds on infrastructure that already works end to end.

**Scope**
- `sougouba-api/` repo, NestJS + Fastify scaffold, `/health` endpoint.
- Supabase project connected (once keys are provided) — Postgres reachable from
  Drizzle/Prisma, Auth project configured (email templates in fr-CA, Google + Apple
  OAuth apps registered), Storage buckets created (`vendor-media`, `product-media`,
  `merchant-documents`, `courier-documents`, `delivery-proofs`) with placeholder RLS
  (locked down for real in Phase 1+).
- Environment config module: typed, validated at boot (fail fast on a missing var
  rather than a runtime null-pointer three requests in).
- Global exception filter → consistent error JSON shape; global validation pipe;
  request logging (pino, Fastify's native logger — fast, structured).
- Swagger wired up, served at `/docs`.
- CI: lint, typecheck, unit tests, migration-check-in-CI (fail if schema drifted
  from committed migrations) on every PR.
- Drizzle/Prisma schema files for every table in the inventory above, first
  migration applied to a dev Supabase project. No business logic yet — just shapes.

**Review gate**: `/health` returns 200 from a deployed (even if just a Fly.io/
Railway/Render dev box) instance, Swagger renders with zero routes, `npm run
migrate` runs clean against a fresh Supabase project from an empty state.

---

## Phase 1 · Identity & accounts

**Goal**: a real account exists, has a role, has addresses — the pre-auth and
account-management screens work against the real thing.

**Scope**
- Supabase Auth wired into the mobile app directly (client SDK) for sign-up/
  sign-in/OAuth/forgot-password — this phase's *NestJS* work is the trigger that
  creates `profiles` on `auth.users` insert, plus:
  - `GET /me`, `PATCH /me` (name, avatar — avatar upload via Storage, replacing
    `updateUser({ avatarUrl: result.assets[0].uri })`'s local-file-URI-only
    behaviour in `profile.tsx`)
  - `PATCH /me/role` (mirrors `mockSelectRole`)
  - `GET/POST/PATCH/DELETE /me/addresses` (mirrors `account/addresses.tsx`'s CRUD
    exactly, including the "exactly one default" invariant, now DB-enforced)
  - `GET/POST/DELETE /me/favorites/{products,vendors}`
  - Referral capture: `POST /auth/signup` (or a Supabase Auth webhook) accepts an
    optional `referralCode`, resolves it via the same `referralCodeFor(userId)`
    hash this session already built (port `data/loyalty.ts` verbatim — it's
    already pure and DB-agnostic), sets `referred_by`.
- **Real geocoding**: `POST /geo/coordinates { postalCode, city }` backed by the
  Mapbox Geocoding API (the Mapbox token already exists in this project for map
  *rendering* — geocoding is a different, currently-unused capability of the same
  account) or a Canada Post/Postal geocoding provider — replacing
  `lib/postalGeo.ts`'s FSA-centroid approximation. City-serviceability check
  (`data/cities.ts`'s 4-city FSA list) becomes a server-side rule too, so a new
  city can be added without a mobile app release.
- Payment methods: **do not build a `payment_methods` CRUD table that stores card
  data.** `usePreferencesStore`'s `PaymentMethod` (brand/last4/expiry) is exactly
  the *display* shape a real Stripe SetupIntent flow produces — Phase 3 replaces
  this with real Stripe Payment Method tokens (card data never touches this
  backend, only Stripe's).

**Frontend integration**: `data/api/auth.ts` mostly disappears (Supabase client
replaces `mockSignIn`/`mockSignUp`/`mockOAuthContinue` directly); what's left is a
thin wrapper for the profile/address/favorites endpoints above.

**Review gate**: sign up on-device with a real email, receive a real Supabase
confirmation email, sign in, add/edit/remove an address and see the default
invariant hold, sign out and back in and the account is exactly as left.

---

## Phase 2 · Catalog

**Goal**: vendors and products are real rows a merchant can manage and a shopper
can browse/search — the customer home, vertical list, vendor detail, product
detail, and merchant catalog/product-form screens all work against it.

**Scope**
- `GET /verticals` (static: grocery/restaurant, with live vendor counts).
- `GET /vendors?type=&categoryId=&city=` (approved-only, mirrors `getVendors`/
  `getVendorsByType`/`getVendorsByCategory`'s `live()` filter).
- `GET /vendors/:id`, `GET /vendors/slug/:slug`.
- `GET /vendors/:id/products?sort=&priceBand=&onSale=&inStockOnly=&q=` — moves
  `lib/productFilters.ts`'s client-side filter/sort into real query params with
  DB-side pagination (the mock ships the whole catalogue; a real API must not).
- `POST /vendors/apply` (merchant registration — see open question #2 above on
  whether this belongs here or is admin-web-only), `GET /vendors/me` (owner's own
  vendor, any status — mirrors `getVendorByOwnerId`'s no-status-filter behaviour).
- Merchant-scoped, ownership-guarded: `POST/PATCH/DELETE /vendors/me/products`,
  `PATCH /vendors/me` (hours, sections), image upload endpoints for vendor
  logo/cover and each product photo (Storage-backed — brand new capability, the
  mock has *no* image upload anywhere; every merchant-created product today ships
  photo-less).
- `GET /categories`.
- Server-side "open now" computed the same way `lib/shopHours.ts`'s `shopDay` does
  (day-of-week + local time against `vendor_hours`) — either at query time in SQL
  or in the service layer; either way it must agree with what the mobile app would
  otherwise compute itself for a cached/stale vendor row.

**Frontend integration**: `data/api/vendors.ts`, `data/api/products.ts`,
`data/api/categories.ts` become HTTP wrappers. `lib/productFilters.ts`'s pure
filter functions can stay as-is for the *cart*/local re-sort case but the catalog
screens switch to passing filters as query params instead of filtering a
full-fetched array.

**Review gate**: a merchant account signs up, gets manually flipped to `approved`
in the DB (Phase 8 replaces this with a real approval flow), uploads a product
with a real photo, and it appears correctly filtered/sorted on the customer home
and vendor detail screens.

---

## Phase 3 · Cart → checkout → orders → payments

**Goal**: an order placed in the app is a real Stripe payment and a real database
row, taxed and fee'd exactly like the mock, with the courier hand-off points
(`ready`, `out_for_delivery`, `delivered`) ready for Phase 5 to drive.

**Scope**
- `POST /orders` — server recomputes subtotal from current product prices (never
  trusts the client's cart total, matching `createOrder`'s existing philosophy),
  applies `data/taxes.ts`'s exact GST 5% / QST 9.975%-on-subtotal-only formula,
  `data/deliveryPricing.ts`'s distance-band fee (distance from the *real*
  geocoded addresses now, not the FSA-centroid approximation), and — new —
  requires a confirmed Stripe PaymentIntent before the row is created, not after.
- `GET /orders/me`, `GET /orders/:id`, `GET /vendors/me/orders` (merchant's own,
  ownership-guarded — this is exactly CDC §04's "Espace commerçant" requirement).
- `PATCH /orders/:id/status` — enforces `lib/orderStatus.ts`'s existing
  `STATUS_ACTOR` map server-side (a merchant can only advance `pending→ready`, a
  courier only `ready→delivered` via Phase 5's endpoints) rather than trusting the
  client's role claim.
- `POST /orders/:id/dispute`, `POST /orders/:id/dispute/reply` — straightforward
  port of `openDispute`/`replyToDispute`; full resolution flow is Phase 6.
- **Stripe integration**: PaymentIntent created client-side-confirmed via Stripe's
  React Native SDK (Apple Pay / Google Pay / card, per the devis), webhook
  endpoint (`POST /webhooks/stripe`) as the source of truth for "payment actually
  succeeded" — never trust the client's "it worked" callback alone for anything
  that creates the order.
- Points redemption at checkout: `redeemPoints` request field, server clamps
  exactly as `data/api/orders.ts`'s `createOrder` already does this session
  (`maxRedeemablePoints`) — this part is close to a direct port.

**Frontend integration**: `ordersApi.createOrder` gains a required
`paymentIntentId` (or equivalent) — the one deliberate signature break flagged in
advance. `PriceSummary`, the checkout screen's points toggle, and
`order-confirmed`/`order/[id]` screens need no structural change, just a real data
source.

**Review gate**: place a real order with a Stripe test card, see the exact same
tax/delivery-fee/points-discount breakdown the mock currently renders, confirm the
webhook fires and the order lands in `pending` only after Stripe confirms payment
(not before).

---

## Phase 4 · Loyalty, referrals & coupons

**Goal**: Points Sougouba works exactly as this session specified it — because
this phase is largely a **port**, not new design — plus the coupon system the
devis promises and nothing built so far covers.

**Scope**
- Direct port of `data/loyalty.ts` (pure rules — copy near-verbatim) and
  `data/api/loyalty.ts` (persisted-table logic → real Postgres queries against
  `loyalty_transactions`): `creditForDeliveredOrder` triggered from Phase 3's
  order-status endpoint on the `→delivered` transition, `debitForRedemption`
  called from Phase 3's `createOrder`, `reverseForOrder` — still unwired to any
  UI, same as the mock, but now genuinely callable once a refund/cancellation-
  after-delivery flow exists.
- `GET /me/loyalty/balance`, `GET /me/loyalty/history`, `GET
  /me/loyalty/referral-stats` — direct port of `getBalance`/`getHistory`/
  `getReferralStats`.
- **Real anti-fraud enforcement** the mock explicitly could not do: phone
  verification (SMS OTP — Twilio or Supabase's phone-auth) gating referral payout,
  properly closing the gap `creditForDeliveredOrder`'s comment flags.
- `DOUBLE_POINTS_ACTIVE` and the other rate constants move into
  `platform_settings`, admin-writable (Phase 8) instead of a hardcoded `false`.
- **New**: `coupons` (code, discount type/amount, vendor-scope-or-platform-wide,
  validity window, usage cap) and `coupon_redemptions`, `POST
  /orders` accepting an optional coupon code alongside `redeemPoints` — exact
  rules pending the "Confirm before Phase 0" item #6.

**Frontend integration**: `data/api/loyalty.ts` becomes close to a pure passthrough
— this was designed this session with exactly this swap in mind, so this should be
the lowest-risk phase in the whole plan. A new `data/api/coupons.ts` +
"Appliquer un code" field at checkout is new mobile-app work, not just a backend
swap.

**Review gate**: the demo account's real order history (once seeded/placed for
real) produces the same balance-and-history shape the Release-build screenshot in
this session's work showed against the mock; a referral end-to-end (sign up with a
friend's code, place a $60+ order, both sides get 300 points) works with a real
SMS-verified phone.

---

## Phase 5 · Courier, dispatch & live tracking

**Goal**: the single biggest gap between mock and reality. A courier's position is
real GPS, not a pure function of elapsed time; an offer is a real server-pushed
event with a real 30-second timeout, not a client polling loop.

**Scope**
- `POST /couriers/apply`, `GET /couriers/me`, `PATCH /couriers/me` — port of
  `submitApplication`/`getCourierByUserId`/`updateCourier`.
- **Dispatch engine, server-side**: replaces `hooks/useDispatchEngine.ts` and
  `lib/dispatch.ts` entirely. A scheduled job (or a Postgres `LISTEN/NOTIFY`-driven
  worker) watches for orders entering `ready` with no assigned courier, ranks
  approved-and-online couriers by distance-to-shop (`rankCouriers`'s exact logic —
  nearest first, this doesn't need to change), and pushes a `dispatch_offers` row
  plus a Supabase Realtime broadcast to that courier's channel. A second scheduled
  job expires offers past `expires_at` (still 30 s — `OFFER_TIMEOUT_MS`) and moves
  to the next-ranked courier, mirroring the mock's `passedOrderIds` behaviour
  exactly but enforced server-side so a courier can't dodge an expiry by staying
  offline at the right moment.
- `POST /dispatch/offers/:id/accept`, `POST /dispatch/offers/:id/decline` —
  accept is a compare-and-swap (first courier to accept wins, matching
  `assignCourier`'s existing "refuses an order that already has a courier" rule).
- `POST /courier/:orderId/pickup` (mirrors `markPickedUp`), `POST
  /courier/:orderId/complete` (mirrors `completeDelivery`) — proof-of-delivery
  photo now genuinely uploaded to Storage, not a local file URI. The mock's
  `signature` method is worse than a stub: `ProofCapture`'s own comment says the
  drawn strokes are "not persisted... there is no backend to upload it to," so
  only a placeholder note survives. Real backend must actually rasterize the
  signature (PNG) or keep the SVG path data and upload it — don't just port the
  "capture and discard" behaviour along with everything else.
- **Real delivery PIN**: server-generated random 4 digits at courier assignment,
  stored, never derivable from the order id — explicit fix for `deliveryPin`'s
  own doc comment admitting it's "not a secret" in the mock.
- **Live position**: courier app posts `{ lat, lng, heading }` every 5–10s while
  `out_for_delivery` (a lightweight `POST /courier/:orderId/location` or, better,
  a Supabase Realtime broadcast the courier app writes to directly, which the
  customer app subscribes to for the tracking map) — replaces `lib/courierRoute.ts`
  and `hooks/useDeliveryProgress.ts`'s entire simulation. Route/ETA for the *map
  line itself* comes from the Mapbox Directions API called once at pickup and
  again if the courier deviates meaningfully, replacing `buildLeg`'s generated
  zig-zag.
- Courier pay: `courierEarnings(distanceKm, tipCad)` (`data/courierPay.ts`) ported
  as-is, computed and frozen onto the order at `complete`, exactly matching the
  mock's "never re-derive after the fact" rule.
- `GET /couriers/me/earnings?days=` — port of `summariseRuns`/`compareRuns` as a
  real SQL aggregation instead of a client-side reduce over every run.

**Frontend integration**: `data/api/couriers.ts` and the dispatch/tracking hooks
change the most of any domain — `useDispatchStore` goes from being the *source of
truth* to a thin cache of what a Realtime subscription delivers; `useDeliveryProgress`
subscribes to live pings instead of computing from a stored `acceptedAt`.
`DEMO_TIME_SCALE` and the whole `lib/courierRoute.ts` module have no real-world
equivalent — they get deleted from the app, not ported.

**Review gate**: two physical/simulated devices — one courier, one customer —
watch the same live position update in near-real-time on both screens during a
real delivery, offer-to-accept-to-complete, with the PIN unguessable from the
order id.

---

## Phase 6 · Disputes & courier issues

**Goal**: the CDC's "gestion des litiges" — closes the loop Phase 3 opened
(shopper can open a dispute, merchant can reply) with the resolution step that
exists nowhere in the current app.

**Scope**
- Dispute and courier-issue CRUD are already covered by Phases 3/5's ports
  (`openDispute`/`replyToDispute`, `reportCourierIssue`). This phase adds:
- `GET /admin/disputes`, `PATCH /admin/disputes/:id/resolve` — admin-only,
  arbitrates between the parties, sets a real `resolved` status the mock's
  `OrderDispute.status: 'open' | 'answered'` union doesn't even have room for yet
  (schema addition: `resolved`/`rejected` alongside `open`/`answered`).
- Same for `courier_issues` — currently has **no** status at all in the mock
  (`CourierIssue` has no `status` field; nothing ever closes one). Add one, and an
  admin resolution endpoint.
- Refund/cancellation-after-delivery, if the business wants it (open question, not
  currently anywhere in the mock or either PDF beyond the loyalty brief's mention
  of "retrait des points si la commande est remboursée") — wires into
  `reverseForOrder` from Phase 4, which has sat unwired since it was written this
  session specifically to be ready for this.

**Review gate**: a dispute opened by a shopper, replied to by a merchant, and
resolved by an admin account is visible, correctly scoped, to all three parties
and nobody else.

---

## Phase 7 · Money: merchant billing & courier payouts (Stripe Connect)

**Goal**: the monetization model from CDC §05 — 12% commission + $70/month,
cumulative — running for real through Stripe Connect on the merchant side, real
money actually reaching couriers on the other, and the merchant dashboard's
numbers computed server-side instead of shipped as raw rows.

**Scope**
- `GET /vendors/me/analytics?days=7|30` — real SQL port of `summariseOrders`/
  `comparePeriods` (`lib/analytics.ts`): revenue on `subtotal` only (excludes tax
  and delivery, exactly as the mock's comment insists), commission/net derived
  from `platform_settings`'s rate, day buckets in local time, top-5 products.
- Stripe Connect **Standard or Express** account per merchant — onboarding link
  flow (`POST /vendors/me/stripe/onboard` → returns a Stripe-hosted onboarding
  URL), `GET /vendors/me/stripe/status`.
- Commission: `application_fee_amount` (or destination-charge equivalent) set at
  PaymentIntent creation in Phase 3, computed on subtotal per the confirmed 12%
  rate — the platform never separately "collects then pays out"; Stripe splits it
  at settlement.
- $70/month subscription via Stripe Billing, `POST /webhooks/stripe` (same
  endpoint as Phase 3, different event types: `invoice.paid`,
  `invoice.payment_failed`) updating `merchant_subscriptions.status` — a vendor
  whose subscription lapses should probably auto-suspend from the customer-facing
  catalog (confirm with client: hard cutoff vs. grace period).
- **Courier payouts — real money movement, which the mock has zero equivalent
  of.** `pendingPayoutCad`/`nextPayoutDate`/`PAYOUT_WEEKDAY` (`lib/courierAnalytics.ts`)
  are today a pure read-only projection over `earningsCad` — nothing ever pays a
  courier. Give couriers Stripe Connect Express accounts too (same onboarding
  pattern as merchants above) and run a weekly scheduled job on `PAYOUT_WEEKDAY`
  (Friday) that batches each courier's `delivered` runs since the last payout
  into a Stripe Transfer. **This also replaces `CourierPayout` (bank transit/
  account collected as plain validated strings at signup, §5's research flagged
  this as unencrypted PII with no real verification) — route payout through
  Stripe's own bank-account collection during Connect onboarding instead of
  storing raw transit/account numbers in this database at all.** If Interac
  e-transfer is preferred over Stripe Transfers for courier payout specifically
  (common for gig-economy apps in Quebec), swap the rail, not the principle: the
  backend should never be the system of record for a raw bank account number
  either way.

**Frontend integration**: `lib/monetization.ts`'s constants move to
`platform_settings`; the business analytics screen's `getVendorStats`/
`comparePeriods` client-side calls become one API call. Courier `payout.tsx`-style
screens move from showing typed-in bank details to a Stripe-hosted onboarding
link, same shape as the merchant flow.

**Review gate**: a merchant completes Stripe Connect onboarding in test mode, a
paid test order shows the correct 12%-of-subtotal commission split in the Stripe
dashboard, a subscription invoice cycle runs (test clock) through paid →
past-due → the app's own handling of that state, and a courier's test-mode
Connect account receives a real (test) weekly Transfer that matches
`pendingPayoutCad`'s own math.

---

## Phase 8 · Admin back-office API

**Goal**: the API surface for the web app the CDC explicitly separates from
mobile — "WEB SÉCURISÉ" — covering registration approval, dispute resolution
(built in Phase 6, exposed here), and platform supervision. **This phase ships an
API only; the admin web frontend itself is a separate project**, per the "confirm
before Phase 0" open question — flag loudly if that assumption is wrong.

**Scope**
- New `admin` role — does not exist in the mobile app's `UserRole` union at all
  today; add it at the database/auth level without touching the mobile app's own
  type (`UserRole` there can stay `customer | business | courier`, since nobody
  signs up as `admin` through the consumer app).
- `GET /admin/vendors?status=pending`, `POST /admin/vendors/:id/approve`, `POST
  /admin/vendors/:id/reject` — reads the legal documents from Storage (uploaded in
  Phase 2 once the confirmed document list from open question #1 is known),
  replaces `useDemoShopApproval`'s "stand-in for the administrator" entirely.
- Same pair for couriers — replaces `useDemoCourierApproval`.
- `GET /admin/disputes`, `GET /admin/courier-issues` (built in Phase 6).
- `GET /admin/stats` — platform-wide order/sales/user/vendor/courier counts (CDC
  §04's "supervision générale").
- `PATCH /admin/settings` — the editable version of `platform_settings`: loyalty
  rates, redemption cap, expiry months, referral reward/minimum, and — this
  session's `DOUBLE_POINTS_ACTIVE` flag — a genuine "lancer une journée points
  doublés" toggle with a start/end time rather than a hardcoded boolean.
- `POST /admin/vendors/:id/suspend`, `POST /admin/couriers/:id/suspend` — the
  `suspended` status both `VendorStatus` and `CourierStatus` already model in the
  mock but which "no code path sets" — this is that code path.

**Review gate**: a pending merchant application, submitted through Phase 2's
`POST /vendors/apply`, is approvable end-to-end by an admin account through these
endpoints alone (verified via Swagger/Postman if the admin web app isn't built
yet), and the merchant's own `GET /vendors/me` reflects `approved` immediately
after.

---

## Phase 9 · Notifications & AI support assistant

**Goal**: the two remaining devis line items with no equivalent anywhere in the
mobile prototype — real push notifications (the app has said "le prototype
n'envoie pas de notifications réelles" in three different settings screens) and
the AI support assistant.

**Scope**
- Firebase Cloud Messaging integration (per the devis) — device token
  registration (`POST /me/push-token`), and triggers wired into the events the
  mock already narrates as "this would be a push notification": order status
  changes (`account/notifications.tsx`'s existing four toggle categories map
  directly to FCM topics/preferences), the delivered-order loyalty-points banner
  this session built as an in-app-only stand-in, a new dispatch offer for a
  courier (replacing the requirement that the courier app be foregrounded to see
  one).
- `POST /support/conversations`, `POST /support/conversations/:id/messages` — an
  OpenAI GPT-backed assistant. **Scope depends entirely on open question #5**;
  at minimum: answers FAQ-shaped questions from a fixed knowledge base (delivery
  zones, loyalty rules, how disputes work) and can read the asking user's own
  recent order status to answer "where's my order" without a human, with a clear
  escalation-to-human path rather than pretending to resolve everything.

**Review gate**: a real push notification arrives on a physical device for an
order status change; a support conversation correctly answers an order-status
question using the asker's real order data and refuses to answer about someone
else's order.

---

## Phase 10 · Hardening, observability & launch

**Goal**: ready for the App Store / Google Play submission the devis promises
Progix will handle, and safe to run with real money and real user data.

**Scope**
- Security review pass (this repo already has a `security-review` skill/workflow
  — run the equivalent against `sougouba-api`): every RLS policy reviewed row by
  row, every endpoint checked for the "trust nothing from the client" rule stated
  at the top of this document, secrets audited (no Stripe secret key, Supabase
  service-role key, or OpenAI key ever reachable from the mobile bundle — only the
  Supabase anon key and Stripe publishable key are client-side, exactly mirroring
  how `lib/mapbox.ts` already documents the public/secret token split).
- ~~Rate limiting~~ **Done** (2026-09-03). `@fastify/rate-limit`, budgets in one
  table in `common/rate-limit.ts`: `/geo` 20/min (Mapbox bills per call),
  `/courier/offers` 20/min (contended write), `/support` 15/min (paid model
  calls, budgeted before the endpoint exists), `/orders` 40/min, `/admin`
  120/min, everything else 300/min. `/health` and `/webhooks/stripe` are exempt
  — a load balancer must not be able to rate-limit itself out of existence, and
  a dropped `payment_intent` event is an order paid for and never created.
  Buckets key on the user id where there is a bearer token and the IP only
  otherwise, because mobile carriers NAT thousands of subscribers behind one
  address. **Not `@nestjs/throttler`**: its current release peers on
  `@nestjs/common` ^7–^11 and this project is on 12.
  ⚠️ In-memory, so per instance — two processes double every budget. Same
  single-instance caveat as the dispatch scheduler; this is the number that
  finally justifies the Redis line in the devis's stack list.
- **An admin audit log** — not in the original scope for this phase, added here
  because Phase 8 shipped without one. `admin_audit_log` (`0028`) records actor,
  action, subject, written reason and a `{field: {from, to}}` diff for all ten
  mutating admin routes, each **inside the same transaction as the change**.
  Append-only by trigger rather than by grant: the API connects as the table
  owner, so a revoke against itself is ignored, and an audit log the audited
  application can rewrite is not evidence of anything. `audit.spec.ts` reads
  Nest's own route metadata and asserts one audited action per mutating route,
  so a future admin route with no `audit.record` call fails the build.
- Structured logging + error tracking (Sentry or equivalent) wired to both the API
  and, ideally, correlated with the mobile app's own crash reporting.
- Load-test the two hot paths that matter most: catalog browse (many reads,
  cheap) and the dispatch offer cycle (a spike of couriers going online at once,
  many candidates ranked per tick).
- Staging Supabase project mirroring production schema; a documented promotion
  path (migrations run in staging, verified, then production).
- CI/CD: deploy pipeline, environment-specific config, rollback plan.
- Support the client through their own App Store / Google Play account creation
  and submission (per the devis — Progix "accompagne la création et publie pour
  le Client"), and the 90-day post-launch bug-fix window the contract already
  promises.

**Review gate**: a full walkthrough of every phase's review gate, back to back,
against the staging environment, by someone who did not build it.

---

## Outstanding, and why

- **Redis** appears in the devis's original stack list (cache) but nothing in this
  plan required it until now — every read path above is either cheap enough for
  Postgres directly or infrequent enough not to need a cache tier. It now has
  its first real justification, and it is not the cache: **rate limiting is
  in-memory and therefore per instance**, so the moment a second API process
  exists every budget doubles. That is the number that decides it. A catalog
  cache still needs a profile before it earns its keep.
- **Coupons and the AI assistant are the two least-specified features in the whole
  contract** — both get a named phase (4 and 9) but both need a real scoping
  conversation with the client before that phase's estimate means anything. Don't
  let either slip through unbuilt the way they've already slipped through the
  mobile prototype once.
- **Whether the admin back-office gets its own web frontend project, and who
  builds it**, is unresolved — Phase 8 as written only builds the API. If it needs
  a UI too, that's a separate, sizeable planning pass of its own (likely its own
  phased document, the way this one exists for the API).
- **Exact geocoding/Directions provider** (Mapbox vs. Google Maps — the devis
  says "Google Maps / Mapbox", the mobile app already has a live Mapbox account)
  is written above as "Mapbox" by default since the token and dashboard access
  already exist; confirm before Phase 1/5 lock in the provider-specific request
  shapes.
