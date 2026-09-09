# Sougouba API — Progress

Read this first in a fresh session. Full plan and rationale: `docs/BACKEND-BUILD-PHASES.md`
in the mobile repo (`sougouba/`) — this file only tracks what's actually built here.

> ## ⚠️ Read this before the phase log: the data layer changed (2026-09-08)
>
> **Drizzle and `DATABASE_URL` are gone.** Every query now goes through PostgREST
> (`supabase-js`), authenticated with `SUPABASE_SERVICE_ROLE_KEY`. Nothing in this
> repo opens a TCP connection to Postgres.
>
> The phase log below is a record of what happened and is **left as written** —
> it describes a Drizzle codebase because that is what it was built against. Do
> not read its code snippets as current. What is still true from it: every
> business rule, every security finding, and every migration.
>
> | Then | Now |
> |---|---|
> | `DATABASE_URL` + `postgres.js` | `SUPABASE_URL` + service-role key |
> | `db.select().from(x)` | `db.from('x').select()` |
> | `db.transaction(tx => …)` | a `plpgsql` function called over `.rpc()` |
> | `src/db/schema/*.ts` | `src/db/database.types.ts` (generated) |
> | `drizzle-kit generate` drift check | **nothing** — see `.github/workflows/ci.yml` |
>
> **Why**: the service-role key was a credential we already had, and the database
> password was not. That unblocked the data layer the same day, after eight phases
> in which no query this API issued had ever reached a database.
>
> **What it cost**: 34 `plpgsql` functions now carry the 19 transactions and
> everything PostgREST cannot express; query-level type safety is gone (the caller
> asserts what a `select` returns); and the settings audit's "before" read can now
> be stale, because PostgREST cannot read inside a transaction.
>
> **The rule that came with it**: PostgREST publishes every function in `public` as
> `POST /rpc/<name>`, and a new function grants EXECUTE to PUBLIC — which includes
> `anon`. **Every function must revoke `public, anon, authenticated` and grant only
> `service_role`**, and the revoke must be verified by attacking it, not by reading
> the migration. This is the fifth appearance of that class of bug on this project
> and the first the architecture hands us for free.
>
> **Live gates** (all committed, all run against the real project):
> `verify:stripe` 12/12 · `verify:orders` 17/17 · `verify:admin` 22/22 ·
> `verify:catalog` 17/17 · `verify:dispatch` 12/12.

## First boot of the ported API (2026-09-09)

Booted against the live project and served real requests. **`GET /health/db`
returns 200 — it has returned 500 since Phase 0.**

```
/health/db                200  {"status":"ok","database":"reachable"}
/vendors?limit=2          200  camelCase preserved, isOpen true, 7 hours, 7 sections
/products/search?q=riz    200
/verticals                200  {grocery: 6, restaurant: 4}
/me, /admin/stats         401  the auth boundary still refuses
/vendors/not-a-uuid       400  and leaks no PostgREST detail
server log                clean — no [postgrest] lines
```

The response contract the admin dashboard depends on survives the port: keys come
back camelCase (`vendorType`, `isHalalCertified`, `isOpen`), and the hydrated
`hours` and `sections` arrays are intact.

### ⚠️ And a self-inflicted data loss worth writing down

The seed round-trip that proves `scripts/seed/index.ts` works end to end was not
run deliberately — it was run by accident. A throwaway script testing
`seed_reset`'s prefix guard looped `['', '%', 'ab', 'zzzz', '5eed']`, called the
function, and only **then** checked `if (p === '5eed') break`. The call came
before the guard. It printed `(not run — would delete)` having already deleted
242 orders, 15 vendors, 225 products, 11 couriers and 15 addresses.

Nothing in the product code was at fault. `seed_reset` behaved exactly as
designed: `profiles`, `auth.users`, `categories` and `admin_audit_log` were
untouched, because it deliberately does not reach them — which is why the damage
was fully recoverable. `npm run db:seed -- --yes` restored the dataset
identically (15 vendors / 10 approved, 242 orders, 225 products, 750 items, 22
disputes, 0 orphans), and in doing so gave the ported seed the end-to-end proof
it had otherwise not had.

Two things worth keeping from it:

- **A guard that runs after the thing it guards is not a guard**, and output
  saying something was skipped is not evidence it was skipped. This project keeps
  meeting that lesson in a new costume — the Phase 2 column revoke that looked
  applied and was not, the 429 that came back as a 500, and now this.
- **The namespace design earned its keep.** Every seeded row is `5eed…`, and the
  reset is scoped to that prefix, so an accident that would otherwise have been
  unrecoverable was a re-seed away from repaired.

All four gates re-run green against the restored data: orders 17/17, admin 22/22,
catalog 17/17, dispatch 12/12.

## Migration state — all applied, verified 2026-09-03

*(Counts below are as of 2026-09-03. Since then the PostgREST port added 13 more
migrations of `plpgsql` functions — no tables, no policies. `src/db/schema/` is
deleted, so the "schema files" rows no longer have a left-hand side.)*

**Every migration is applied to the live Supabase project** (`wyjkaiquugoblvvzpjnq`),
and the live schema matches the schema files. Checked, not assumed:

| | |
|---|---|
| Migrations applied (`supabase_migrations.schema_migrations`) | 31 |
| Migration files in `drizzle/` | 30 (`0000`–`0029`) |
| Tables in `public` | 31, and **all 31 have RLS enabled** |
| RLS policies | 48 |
| `private.*` helper functions | 7 |
| Storage buckets | 6 |
| `drizzle-kit generate` | "No schema changes" — schema files match the snapshot |
| Live vs. schema files | identical table set and column counts, table by table |

`auth.users` is the one table declared in `src/db/schema/auth.ts` that is *not*
ours and never migrated by us — it is a stub so the `profiles.id` foreign key
compiles. It lives in the `auth` schema, so it is correctly absent from the
`public` count above.

### The one thing that does not line up: 31 applied vs. 30 files

Supabase has a migration with no file behind it —
`20260903022631 align_review_fk_constraint_names`, applied right after
`application_review_columns`. It renamed the two review foreign keys to the
names `drizzle-kit` generates.

**This is not schema drift, and it does not need fixing.** Local
`0023_application_review.sql` creates those constraints with the *final* names
directly, so replaying the committed migrations onto an empty database reaches
the identical end state in one step instead of two — verified: the live
database carries `vendors_reviewed_by_profiles_id_fk` and
`couriers_reviewed_by_profiles_id_fk` and no constraint under any older name.

What it does mean is that **the two migration histories are not row-for-row
comparable**, which will matter the first time someone diffs this project
against staging and finds an extra row. Deliberately not "fixed" by adding a
matching local file: that file would do nothing on a fresh database and would
exist only to make two ledgers agree about the past.

### CI's drift check does not cover this

`.github/workflows/ci.yml` runs `drizzle-kit generate` and fails on an
uncommitted diff. That compares **schema files → snapshot**. It cannot see a
statement applied straight to the database with no file behind it, which is
exactly how the row above came to exist. The check that catches that class is a
live introspection diff, and it needs a working `DATABASE_URL` — see below.

## Phase 0 — done (2026-08-30)

**Stack, as scaffolded**: NestJS 12 on Fastify (`@nestjs/platform-fastify`), TypeScript
`nodenext` ESM (every relative import needs its `.js` extension — this is not a typo
anywhere you see it), Vitest (not Jest), oxlint (not ESLint), Drizzle ORM + `postgres.js`
against Supabase's Postgres directly (not through PostgREST).
*(Superseded 2026-09-08 — the data layer is `supabase-js` over PostgREST now. See the
banner at the top.)*

**Live Supabase project**: `wyjkaiquugoblvvzpjnq` (`https://wyjkaiquugoblvvzpjnq.supabase.co`).
Connected via the `supabase` MCP server (already authenticated in this session/toolchain —
see the mobile repo's `.mcp.json`).

**Schema — 30 tables, applied and verified live** (`src/db/schema/*.ts` → `drizzle/0000..0003`,
identity RLS/trigger/avatars in `0004..0006`, see Phase 1 below):
- Full inventory from the plan doc's "Data model" table: identity (`profiles`, `addresses`,
  favorites), catalog (`vendors`, `products`, categories, sections, hours, registrations),
  orders (`orders`, items, status history, deliveries, proofs, disputes, courier issues),
  courier (`couriers`, insurance, payouts, locations, dispatch offers), loyalty (transactions,
  coupons), merchant subscriptions, `platform_settings` (seeded, singleton row), support.
- `profiles.id` has a real FK into Supabase's `auth.users` (stubbed in `src/db/schema/auth.ts`
  purely for the reference — never migrated by us).
- RLS **enabled on every table, zero policies yet** — the safe placeholder (nothing reachable
  via `anon`/`authenticated`/PostgREST until each domain's real policies land starting Phase 1).
  Verified via `get_advisors(type: "security")`: only `INFO`-level "RLS enabled, no policy"
  findings, nothing worse.
- Three indexes added beyond the straight schema dump, matching *confirmed* query patterns
  from the mobile app's mock (not speculative): `vendor_categories.category_id`
  (`getVendorsByCategory`), `order_deliveries.courier_id` (a courier's own history),
  `courier_locations.order_id` (Phase 5 live tracking).
- Storage buckets created: `vendor-media`/`product-media` (public), `merchant-documents`/
  `courier-documents`/`delivery-proofs` (private, no policies yet — same placeholder as RLS).

**App skeleton**: `/health` (liveness) and `/health/db` (proves the Postgres connection),
global exception filter (one JSON error shape), a `ZodValidationPipe` applied per-route (no
global `class-validator`-based `ValidationPipe` — this project standardizes on Zod, and a global
one would need a dependency installed for nothing, since no DTO here uses its decorators; an
early draft wired one anyway and Phase 1's actual boot test caught it — see below), Swagger at
`/docs` (non-production only), typed+validated env config (`src/config/env.ts`) that **fails
fast with every missing var named at once**.

**Verified, not just written**:
- `npx tsc --noEmit` — clean.
- `npm run lint` (oxlint) — clean.
- `npm test` (vitest) — 4/4 passing (`src/config/env.spec.ts`).
- `npm run build` (`nest build`) — clean.
- `node dist/main.js` with no `DATABASE_URL` set → throws
  `Invalid environment configuration:\n  - DATABASE_URL: ...` and exits, rather than crashing
  opaquely three requests in. **The app has not yet been booted successfully end-to-end** —
  that needs a real `DATABASE_URL`, which this session's Supabase MCP access does not expose
  (by design — it's a service-role-equivalent secret). See "Needed from you" below.
- Migrations applied via MCP `apply_migration` **and** mirrored as committed files under
  `drizzle/`, confirmed in sync both ways (`drizzle-kit generate` locally produces the
  identical statements already live; `mcp__supabase__list_migrations` shows all four).
- CI (`.github/workflows/ci.yml`): lint, typecheck, test, build implied, plus a schema-drift
  check that runs `drizzle-kit generate` and fails if it produces an uncommitted diff — hasn't
  run for real yet (no remote to push to), but each step was run locally first.

**Not yet done, deliberately** (Phase 0 is infra only):
- No deploy target chosen yet (Fly/Railway/Render — the mobile repo already has a Railway MCP
  connection, worth considering first). No staging/production split.
- No git remote, no first commit — left for you to review before anything is pushed.

## Phase 1 — done (2026-08-30)

**Goal met**: a real account exists, has a role, has addresses — verified live against the
actual Supabase project, not just typechecked.

**Database side** (all applied via MCP `apply_migration`, mirrored under `drizzle/0004..0006`,
confirmed in sync via `mcp__supabase__list_migrations`):
- `handle_new_user()` — a `SECURITY DEFINER` trigger function creating the matching `profiles`
  row the instant Supabase Auth creates an `auth.users` row (mirrors the mock's
  `authApi.mockSignUp`, which always built the two together). **Verified with a real insert**,
  wrapped in `BEGIN; ... ROLLBACK;` so nothing persisted: a test `auth.users` row produced the
  right `profiles` row (`full_name` from `raw_user_meta_data`, `role` null, `member_since` ==
  `created_at`), then both tables confirmed back to 0 rows after rollback.
- RLS policies for `profiles` (own row), `addresses` and `favorite_products`/`favorite_vendors`
  (own rows, full CRUD where the mock allows it) — own-row predicates throughout, `WITH CHECK`
  on every UPDATE so a row can't be updated into pointing at someone else's id. Confirmed via
  `get_advisors`: these four tables no longer appear in the "RLS enabled, no policy" list;
  everything else (Phase 2+ domain) correctly still does.
- An `avatars` Storage bucket (public) + `storage.objects` policies scoped to
  `<user_id>/<filename>` — added mid-phase once "avatar upload via Storage" turned out to need
  a bucket Phase 0 hadn't provisioned. INSERT+SELECT+UPDATE+DELETE, all four, because an upsert
  (replace an existing avatar) needs all three of the first and DELETE is the obvious fourth.

**Deliberately did *not* reimplement `data/loyalty.ts`'s `referralCodeFor` hash in plpgsql** —
`Math.imul`-based 32-bit overflow semantics are easy to port subtly wrong, and a mismatch would
mean the trigger and the API disagree about whose code is whose. Referral capture instead goes
through `POST /me/referral`, called by the mobile app once the account exists (see below) — the
hash lives in exactly one place, `src/common/loyalty/referral.ts`, a straight port.

**NestJS side** — new modules: `auth` (`SupabaseAuthGuard`, JWKS-based — verifies against this
project's own `/auth/v1/.well-known/jwks.json`, **not** `SUPABASE_JWT_SECRET`, per Supabase's own
current guidance against the legacy shared-secret path), `geo` (ported `data/cities.ts` +
`lib/validation/address.ts` verbatim as `src/geo/cities.ts` / `address-validation.ts`, plus
`POST /geo/coordinates` — real Mapbox Geocoding v6, replacing the mock's FSA-centroid
approximation), `me` (`GET/PATCH /me`, `PATCH /me/role` — one-way, matching the mock's "role
gate is one-way by design" — and `POST /me/referral`), `addresses` (full CRUD under
`/me/addresses`, the "exactly one default" invariant moved server-side into a transaction:
claiming default un-defaults the previous one first, deleting the default promotes the oldest
remaining address), `favorites` (`/me/favorites/{products,vendors}`, idempotent add via
`onConflictDoNothing`, a real 404 on favoriting something that doesn't exist via a caught FK
violation).

**Verified — genuinely booted this time, not just typechecked.** `DATABASE_URL` still isn't
available (see "Needed from you"), but `postgres.js` connects lazily, so the app was booted
against a syntactically-valid placeholder `DATABASE_URL` plus the **real** `SUPABASE_URL`, on a
free local port:
- Full route table printed on boot — every endpoint below actually mapped, nothing silently
  missing.
- **Two real bugs caught by this alone**, neither visible to typecheck/lint/build: Swagger under
  the Fastify adapter needs `@fastify/static` (missing dependency — installed); `main.ts` wired a
  global `class-validator`-based `ValidationPipe` that was never actually usable (no DTO uses its
  decorators, and `class-validator` itself wasn't even installed) — removed rather than "fixed"
  by adding a dependency for something this project doesn't use.
- `GET /health` → `200 {"status":"ok",...}`. `GET /docs` and `/docs-json` → real Swagger UI and a
  valid OpenAPI document listing every route.
- `GET /me` with no `Authorization` header → `401 "Missing bearer token"`.
- `GET /me` with a well-formed JWT, correct `kid`, garbage signature → **227ms response time**
  (vs. 0.5ms for a plain malformed string) and `401 "Invalid or expired token"` — the latency gap
  is the tell that the guard genuinely round-tripped to Supabase's live JWKS endpoint
  (independently confirmed reachable: `curl .../auth/v1/.well-known/jwks.json` returns a real
  ES256 key) and failed signature verification for real, not on token format alone.
- `POST /geo/coordinates` with an unserved city → `400`, the **exact French message** the ported
  schema produces (`"Sougouba ne dessert pas encore cette ville"`) — proves the port, not just
  that *a* validator ran.
- `POST /geo/coordinates` with a valid, servedcity/postal pair → `503 "Geocoding is not
  configured — MAPBOX_SECRET_TOKEN is unset"` — the correct, honest answer given no Mapbox token
  is available yet; not a silent 200 with a fake coordinate.
- `npm test` — 18/18 passing across 3 files, including a **regression test pinned to a real
  value observed live in the mobile app's Simulator this session** (`referralCodeFor('usr_customer_demo')`
  === `'SGB-RU2NWK'`, from the "Parrainer un proche" screen screenshot) and the full set of
  address-validation cases ported from the mobile app's own `verify-logic.ts`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx drizzle-kit generate` (no drift) —
  all clean.

**Not done**: the mobile app itself isn't wired to real Supabase Auth yet — that's real
`@supabase/supabase-js` + AsyncStorage session persistence work in `sougouba/`, `data/api/auth.ts`,
and the `(auth)` screens, not attempted this session. `POST /geo/coordinates` is unverified against
a *real* Mapbox response (no token available). No rate limiting yet (Phase 10).

## Phase 2 — done (2026-09-03)

**Goal met**: vendors, products and categories are real rows a merchant manages and a
shopper browses, filtered and paginated in the database rather than on the phone.

**Database side** (`drizzle/0007..0010`, applied via MCP and mirrored as files, verified in
sync via `list_migrations`):
- `0007` seeds the eight platform categories from the mobile app's `data/seed/categories.ts`,
  with **written-out uuids** rather than generated ones — this seed runs in dev, staging and
  production, and a category whose id differs per environment makes every `category_id` in a
  data export environment-specific.
- `0008` gives the seven catalog tables real RLS, replacing Phase 0's placeholder. The rule
  the whole domain turns on: a shop the platform has not approved is invisible to everyone
  except the merchant who owns it. `vendor_registrations` (NEQ, responsible person, phone) is
  owner-only even for an approved shop. Storage policies for `vendor-media`/`product-media`/
  `merchant-documents`, keyed `<vendor_id>/<filename>`.
- `0009` **closes a privilege escalation `0008` left open** — see below.
- `0010` moves the two policy helpers into a `private` schema; created in `public` they were
  published as `/rest/v1/rpc/owns_vendor` and `/rest/v1/rpc/vendor_is_visible`.

**The escalation, because it is the kind that ships silently.** With `0008` applied, a
merchant holding an ordinary Supabase session could call PostgREST directly and run
`update vendors set status = 'approved' where id = <their own shop>` — successfully. It was
found by *running the attack*, not by reading the policy back. `vendors_update_own` lets a
merchant update their own row, and RLS has no way to express "this row, except four of its
columns": a `WITH CHECK` that must permit a rename cannot forbid a status change. Supabase's
default grants then hand `authenticated` **and `anon`** table-wide UPDATE on every column, so
the policy was the only gate and it was the wrong shape of gate. A merchant could therefore
approve their own shop, defeating the administrator review the CDC puts between "someone
registered" and "the shop is on the platform" (addendum §02) — the one check keeping an
unvetted shop away from shoppers. Self-rating (`rating`, `review_count`) was open the same
way. `0009` fixes it with column privileges, which are the right tool: RLS decides which
*rows*, grants decide which *columns*. Re-verified after the fix, each attempt isolated:
`status`, `rating`, `review_count`, `slug`, `owner_id`, pre-approved INSERT and
moving a product to another shop are all **DENIED**, while a merchant editing their own
name/specialty/ETA still **works**.

**NestJS side** — one `catalog` module (`src/catalog/`), 20 routes:
- Public: `GET /verticals`, `GET /vendors` (`type`/`categoryId`/`city`/`q`/`openNow` +
  pagination), `GET /vendors/slug/:slug`, `GET /vendors/:id`, `GET /vendors/:id/products`,
  `GET /products/search`, `GET /products/:id`, `GET /categories`.
- Merchant: `POST /vendors/apply`, `GET|PATCH /vendors/me`, `PUT /vendors/me/hours`,
  sections CRUD, products CRUD under `/vendors/me/products`.
- `lib/productFilters.ts`'s `applyFilters` moved into SQL — the band bounds keep their
  asymmetry (`>= min`, `< max`) so a $10.00 product lands in "10 $ à 20 $" and nowhere else.
- **Public vendor lookups are approved-only**, a deliberate tightening over the mock, whose
  `getVendorById` filtered nothing because the merchant's own pending shop had to be reachable
  somehow. It has its own route now (`GET /vendors/me`).
- **No upload endpoint, deliberately.** The app already holds a Supabase session, so it
  uploads straight to Storage and the policies above decide whether it may; what this API owns
  is the *reference*, and `src/catalog/media-paths.ts` refuses any path outside the caller's
  own `<bucket>/<vendorId>/` prefix. Without that check a merchant could point their cover
  image at a competitor's object, since the write that matters (the row) comes through here.

**Verified**:
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx drizzle-kit generate` (no drift) — clean.
- `npm test` — **45/45** across 6 files.
- Booted end-to-end again (placeholder `DATABASE_URL`, real `SUPABASE_URL`): all 20 routes
  mapped; `/vendors/me` correctly registered *before* `/vendors/:id` (declared the other way
  round it is swallowed as `id="me"` and 400s on the uuid pipe); auth boundary 401s; query
  validation rejects `limit=100000`, `type=bakery`, `openNow=maybe` with the ported French
  messages; DB-backed routes fail with a connection error, not a code error.
- **Open-now checked against fixed instants** rather than "now": open-inclusive (09:00 → true),
  close-exclusive (21:00 → false), `closed` flag and day-matching both respected, and
  18:00 UTC correctly read as 14:00 Montreal — the timezone conversion is load-bearing, since
  a naive `now()` would call a shop that closes at 21:00 shut from 16:00 local every day.
- **RLS proven with live fixtures** (two merchants, one approved shop and one pending, then
  deleted): `anon` sees 1 vendor, 2 products, 0 pending-shop rows, 0 registrations, 8
  categories; the pending shop's own merchant sees 2 vendors and their own paperwork and
  nobody else's; cross-merchant reprice/rename/delete all return 0 rows; `anon` writes denied.
- `get_advisors(security)`: **zero WARN**. The catalog tables no longer appear in the
  "RLS enabled, no policy" list; every remaining INFO is a Phase 3+ table.

**Not done**: a real caught bug this phase — `updateProductSchema` was first derived from the
same object as `createProductSchema`, defaults included. `.partial()` makes a defaulted field
optional but the default still fires when the key is absent, so `PATCH { name }` arrived
carrying `tags: []` and `imageUrl: ''` — indistinguishable from a merchant clearing both, so
renaming a product would have silently deleted its tags and photo. Fixed by keeping defaults
out of the shared field set; pinned by a regression test. Still outstanding: the mobile app is
not wired to any of this, no image has been uploaded through a real Storage policy yet, and
the Phase 2 review gate ("a merchant uploads a product with a real photo and it appears on the
customer home") needs that wiring before it can actually be walked.

## Phase 2 — review pass (2026-09-03)

A second reader went over the catalog code after it was written and found **seven real
defects**, all now fixed and pinned by tests where they were testable:

1. **Cross-tenant inventory oracle in `DELETE /vendors/me/sections/:id`.** The
   "does this section still hold products?" count ran *before* the ownership check and was
   not scoped to the caller's shop. Section ids are published on every public vendor
   response, so passing a competitor's id returned either `403 "still holds 12 product(s)"`
   or a `404` — enumerating another merchant's per-section inventory without deleting
   anything. Ownership is now resolved first and the count is vendor-scoped.
2. **Vendor list pagination could repeat and drop shops.** `ORDER BY name` alone, on a
   column that is not unique and where duplicate names are *expected* (`uniqueSlug` exists
   for exactly that). With ties, page 2 could re-show a shop from page 1 and silently skip
   another. `asc(vendors.id)` added as the tiebreak — `ProductsService.ordering()` already
   did this on every branch; the vendor list was the one that missed it.
3. **`?q=%` returned the entire catalogue.** Raw user input interpolated into an `ILIKE`
   pattern, so `%` and `_` were live wildcards — the opposite of the literal
   `name.includes(q)` this ports. Both call sites now escape through
   `common/sql/like.ts`.
4. **Two races in registration.** The "already has a shop" check ran outside the
   transaction against a non-unique column, so a double-tapped submit created two shops —
   after which `ownedVendorId()`'s `limit(1)` with no ordering made every later product
   write land in either shop, nondeterministically. Fixed at the database:
   `vendors_owner_id_unique` (`drizzle/0012`). The slug race separately surfaced a raw
   `23505` as a 500; both violations are now caught by constraint name and answered
   properly.
5. **Three validation gaps that returned 500s.** `priceCad: 100000000`,
   `stockQty: 2147483648` and `weightG: 100000` each overflowed their column and came back
   as an unhandled Postgres `22003`. Bounded to what the columns actually hold. Nutrition
   grams also silently rounded (`7.129` → `7.13`) — the exact failure the price rule
   exists to prevent, just never applied there.
6. **Nutrition could be set but never cleared.** No request could write the four columns
   back to NULL, so a merchant who filled the block by mistake was stuck with it and the
   product page kept drawing the strip. Now nullable, matching `compareAtPriceCad`.
7. **Concurrent delete during a product update → 500.** The existence check and the
   `UPDATE … RETURNING` are separate statements; a row deleted in between made
   `toProduct(undefined)` throw. Guarded, and now a 404.

The reviewer separately confirmed as correct: Nest routing/DI and pipe placement, the
numeric-as-string handling throughout, `and()`/`or()` non-empty guarantees, the absence of
N+1s, approved-only gating on every public read, the Zod defaults separation, and
`assertMediaPath`.

## Phase 3 — code complete, unverified against live Stripe (2026-09-03)

**Resolved first**: one vendor per order ("Confirm before Phase 0" #7). The devis sells
"panier & commandes multi-commerces" while the app enforces one shop per cart; the reading
taken is that "multi-commerces" describes a platform hosting many merchants, not a cart
mixing them — which is also how every comparable courier marketplace works, since one order
is one pickup. **Worth re-confirming in writing with the client**, as the plan doc now notes.

**Pricing engine** (`src/orders/pricing.ts`) — ports of `data/taxes.ts`,
`data/deliveryPricing.ts`, `data/utils/geo.ts` and the redemption half of `data/loyalty.ts`,
pure and dependency-free so the rules can be tested against the exact figures the app
renders. TPS 5 % + TVQ 9.975 % from the same base (not compounded — Québec de-harmonised in
2013), on the subtotal only, delivery added untaxed afterwards. 24 tests.

**Endpoints** (11): `POST /orders/quote` → `POST /orders/payment-intent` → `POST /orders`,
plus `GET /orders`, `GET /orders/:id`, `POST /orders/:id/dispute`, the merchant's
`/vendors/me/orders` list/detail/`PATCH :id/status`/`dispute/reply`, and
`POST /webhooks/stripe`.

**The rules that are actually enforced**, each for a stated reason:
- **The cart carries no prices.** `cartSchema` accepts product ids and quantities and
  nothing else — a `unitPriceCad` on the wire would be a number worth attacking.
  Everything is looked up: line prices from the catalogue as it stands now, both sets of
  coordinates from stored rows, the points balance summed from the ledger.
- **Stripe is asked, never told.** `POST /orders` re-prices the cart from scratch, then
  checks the intent's **status, amount, currency and owner** before writing. Each closes a
  different hole: `requires_capture` is refused as well as failures; a cheaper intent the
  client also owns cannot be substituted; a CAD total cannot settle in a weaker currency;
  and an intent id is not a secret between users.
- **Idempotent.** `orders.stripe_payment_intent_id` is UNIQUE (`drizzle/0011`), and a
  repeat call returns the existing order rather than creating a second against one payment.
- **Stock decrements in the order's own transaction**, guarded by
  `where stock_qty >= qty`, so two simultaneous checkouts cannot both take the last unit.
  A loss rolls the order back and logs `REFUND REQUIRED` — the shopper has been charged by
  then, and Phase 6 is where that becomes automatic.
- **Status changes go through `assertTransition`**, which refuses skipping ahead as well as
  going backwards, refuses any move out of a terminal status, and refuses the courier's two
  steps to a merchant — a merchant advancing `ready → delivered` would otherwise complete
  an order, and later trigger its loyalty credit and courier payout, with nobody having
  carried anything. 21 tests.
- **The webhook's signature is the whole gate** — it is unauthenticated by necessity, so
  without it the endpoint is an internet-facing "mark this paid" button.

**Verified**: `tsc`, lint, build, no schema drift; **83 tests passing**; booted with all 11
routes mapped; every order route 401s without a token; the webhook returns an honest 503
naming `STRIPE_WEBHOOK_SECRET` when unset, and — booted *with* a secret — **rejects a forged
signature with 400**, which also proves `rawBody: true` is delivering real bytes.
`drizzle/0013` gives the orders domain RLS: an order is visible to its shopper and its
merchant, to `anon` not at all, and no role gets a direct write (every write here moves
money, stock or a status others act on).

**Not verified, and worth saying plainly**: no real Stripe key exists in this environment,
so no PaymentIntent has ever been created or retrieved. The Stripe code paths are typed,
booted and structurally exercised, but the round-trip is untested — Phase 3's review gate
("place a real order with a test card, confirm the webhook fires and the order lands in
`pending` only after Stripe confirms") needs a test-mode key. The loyalty *debit* for a
redemption is deliberately not written yet: the ledger's rules belong together in Phase 4
rather than half here.

## Phase 4 — done (2026-09-03)

**The ledger** (`src/loyalty/`). Append-only: every row is a signed movement and a balance
is their sum. No stored total anywhere — a balance column would be a second source of truth
that a half-failed write could leave disagreeing with the movements that produced it.

**Rates are parameters now, not constants.** The brief puts them under an administrator's
control ("modifier les règles"), so `platform_settings` is read on every pricing decision
and `data/loyalty.ts`'s constants survive only as the fallback an offline preview uses.
`DOUBLE_POINTS_ACTIVE` gained a **window** alongside the toggle: an admin who flips it on
for a Saturday promotion should not have to remember to flip it back, and a switch left on
by accident doubles every point the platform issues indefinitely. `SettingsService` is
deliberately **uncached** — the cost is a single-row primary-key lookup, and the price of a
TTL is an admin ending a promotion and watching nothing happen.

**Endpoints**: `GET /me/loyalty/{balance,history,referral-stats}`. Balance returns the
conversion rate and redemption cap alongside the points, so the app doesn't hold rates an
admin can change. History includes expired rows — it is a record, not a balance.

**Wired into checkout**, closing what Phase 3 left open: the redemption debit and the coupon
redemption both run **inside the order's own transaction**, so an item selling out mid-checkout
rolls them back with the order. A shopper must never lose points, or burn a limited coupon, on
an order that does not exist.

**`creditForDeliveredOrder`** credits the order and pays both sides of a referral, conditioned
on the same event — the brief pays a referral only once the referred friend's *first* order has
actually been delivered and cleared the 60 $ floor. "First" is counted from the orders table
rather than tracked in a flag, because a flag would be a second source of truth the ledger
already contains. **It has no caller yet**: nothing reaches `delivered` until Phase 5's
completion endpoint exists, exactly as `reverseForOrder` sat unwired in the mock.

### Two bugs found by running things, not by reading them

1. **Every coupon redemption would have thrown at runtime.** Drizzle's `insert().select()`
   requires the selected fields to match the table definition exactly — same fields, same
   order, defaults included. `tsc` accepted it; rendering the query with `.toSQL()` did not.
   Rewritten as explicit SQL.
2. **The usage limit did not actually limit anything.** The first implementation was
   `insert … where (select count(*) …) < usage_limit`, which *reads* atomic and is not: under
   READ COMMITTED each transaction's counting subquery sees its own snapshot, so two
   concurrent checkouts both see room for one more and both take it. Demonstrated against the
   real database — two claims in one statement both succeeded against a limit that should have
   allowed one more. Replaced with a `used_count` column and a single
   `update … set used_count = used_count + 1 where used_count < usage_limit`, which Postgres
   *does* serialise: the loser re-evaluates against the winner's committed row and matches
   nothing. Re-verified: three claims against a limit of 2 produce exactly 2.

### Coupons — built on assumptions, and they need confirming

"Coupons promotionnels" is contracted in the devis and **specified nowhere**. It was built
rather than deferred because it has already slipped through the entire mobile prototype once
without anyone noticing it was in scope. Every rule is stated in `CouponsService`'s doc
comment; the ones worth a client conversation:
- Discounts the **subtotal only** (discounting tax would mean remitting money never collected).
- `percentage` reads `discount_value` as a percent (15 → 15 %).
- **One coupon per order**, no coupon-on-coupon stacking.
- Coupons **may** combine with points; each computes against the original subtotal and their
  sum is capped at it. (Computing the points cap against a coupon-reduced subtotal would let a
  coupon silently shrink what a shopper's own points are worth.)
- `usage_limit` counts across **all** customers. There is no per-customer limit — the table has
  no column for one, and inventing it before the rule is known is how a schema acquires a field
  nobody can explain.

### Verified

- `tsc`, lint, build, no drift; **101 tests** (10 files); 50 routes mapped on boot, now reading
  the new `.env` directly.
- **Idempotency proven live**: replaying the exact writes `creditForDeliveredOrder` makes —
  the credit plus both referral rows — wrote 3 rows the first time and **0** the second.
  Crediting a delivery twice is inventing money, and the credit path already has two callers
  by design.
- **Balance arithmetic proven live**: a ledger of +75, +300, +40 (expired) and −200 sums to a
  raw 215 and a live **175** — the expired earn drops out, the debit still counts. Expiring a
  debit would hand back points already spent.
- **RLS proven live**: a shopper sees their own 4 rows and 0 of their referrer's; minting
  points, editing the ledger, deleting their own debits, enumerating coupons and reading the
  commission rate are all **DENIED**.
- `get_advisors(security)`: zero WARN. `coupons`, `coupon_redemptions` and `platform_settings`
  still show INFO "RLS enabled, no policy" — **correct and intentional**: all grants are
  revoked from `anon`/`authenticated`, so nothing can reach them and a policy would be
  decoration. The linter cannot see grants.

**Not done**: referral anti-fraud. The brief's second gate is a **verified phone number**, and
without it one person with two email addresses can refer themselves and collect both sides.
The mock admitted the same gap. It needs an SMS OTP decision (Twilio vs. Supabase phone auth)
before real money sits behind it — `creditForDeliveredOrder` logs every unverified referral
payout so the exposure is visible rather than silent.

## Phase 5 — done (2026-09-03)

The plan calls this the single biggest gap between mock and reality, and the reason is that
almost nothing here was a port. Four things the mobile prototype *simulated* are now real,
and each one is a behaviour change, not a refactor:

**1. The dispatch loop moved off the courier's phone.** `hooks/useDispatchEngine.ts` and
`store/useDispatchStore.ts` ran the whole thing client-side, which made every guarantee
advisory: a backgrounded app was invisible to the dispatcher, and a courier could dodge an
offer expiry simply by being offline when it lapsed. `DispatchService.tick()` now runs
server-side every 5 s — expire first, then offer, so a courier who just let one lapse is
excluded from the same tick's ranking. Ranking is done **in SQL** (haversine inline): the
candidate set is "every online courier", and pulling the roster into Node to sort it would
be a full scan every few seconds.

**2. Eligibility is a real question now.** The mock ranked every approved courier. The
dispatcher requires approved **and** on shift **and** recently heard from **and** not
already carrying a run **and** within 15 km of the shop. `is_online` had nowhere to live in
the schema before — "online" was client memory — so `couriers` gained `is_online` and
`last_seen_at`. The heartbeat matters: an app killed mid-shift never sends "going offline",
so without a TTL the dispatcher would keep offering runs to a phone in someone's pocket and
every one would expire.

**3. The PIN is a secret.** This is the one place Phase 5 deliberately **refuses** to port
the mock. `data/delivery.ts` derives its PIN from the order id and its own comment is candid:
"a hand-off token, not a secret — anyone holding the order can compute it." The order id
travels in URLs, push payloads and the merchant's dashboard, so a derived PIN proves nothing
about who is at the door. Now generated with `randomInt` at assignment, stored, and compared
server-side at completion.

**4. Proof of delivery is actually kept.** `ProofCapture` admits the drawn signature "is not
persisted… there is no backend to upload it to". There is now — the path is stored, and
completing with neither an image nor a PIN is refused, because a delivery with no proof is
exactly the state a dispute turns on.

**Endpoints** (14, all under `/couriers/me`): apply, profile, `shift` (on/off, with position),
`heartbeat`, `earnings`, `runs`, `offers` + accept/decline, and per-run `pickup`, `complete`,
`location`.

**The joins that close earlier phases**: `complete` is the caller
`LoyaltyService.creditForDeliveredOrder` has been waiting for since Phase 4 — it is the one
place an order actually becomes `delivered`. The credit runs *outside* the delivery
transaction and non-fatally: the delivery is a physical fact that already happened, and a
ledger hiccup must not un-deliver it (the call is idempotent, so a replay settles it).
Pickup and complete both check the same `STATUS_ACTOR` table the merchant's endpoint uses,
so a courier cannot pick up an order the shop has not finished packing.

**Pay is frozen, never re-derived.** `earnings_cad` is written once at completion from the
distance recorded at assignment plus the tip as it landed. Re-deriving from today's rates
would rewrite a courier's history the day a rate changes — the one thing an earnings screen
must never do. `GET /couriers/me/earnings` is the SQL port of `summariseRuns`, bucketed in
**Montreal time**: a run delivered at 20:00 local is 00:00 UTC the next day, and bucketing
in UTC would move a courier's whole evening onto tomorrow's bar.

**Realtime instead of polling** (`drizzle/0019`): `dispatch_offers` and `courier_locations`
are published, so an offer arrives as a push rather than being waited for — a 30-second
window learned about 5 seconds late is a third of it gone. `GET /me/offers` remains as a
first-load and dropped-socket fallback.

### Verified live

- `tsc`, lint, build, no drift; **111 tests** (11 files); 64 routes mapped; all courier
  routes 401 without a token.
- **Ranking and eligibility, against real rows**: three couriers where the two *closest*
  (0.24 km and 0.47 km) are ineligible — one pending approval, one offline — and the only
  eligible one is 2.99 km away. The SQL picked correctly, which a distance-only ranking
  would not have.
- **The accept race**: two couriers accepting the same order in one statement — exactly one
  won (`order_deliveries.order_id` is the primary key, so the loser's insert cannot land),
  one delivery row, a stored PIN. Re-offering an order to a courier who already saw it
  wrote **0 rows** — the server-side form of the mock's `passedOrderIds`.
- **Courier RLS**: the courier who lost the race sees his own 1 offer and his own 1 file,
  and **0** deliveries. Setting his own pay, self-accepting an offer, stealing the run and
  approving his own file are all **DENIED**.
- **The scheduler survives failure**: booted against the placeholder `DATABASE_URL`, ticks
  fail every 5 s as expected and the process keeps serving (`/health` 200). An unhandled
  rejection there would have stopped dispatch for the life of the process and no order would
  ever be offered again.

### Known limits, stated where someone will be standing

- **The scheduler is an in-process interval and assumes a single instance.** Two replicas
  would both tick; the writes are safe (unique index on `(order_id, courier_id)`,
  compare-and-swap on accept) but they would burn two ticks to do one tick's work and could
  offer one order to two couriers in the same second. Before Phase 10 scales past one
  instance this needs a Postgres advisory lock or a real scheduler. The note lives in
  `dispatch.scheduler.ts`.
- **Courier pay rates are still placeholders** (`BASE_FARE_CAD` 3,50 $ + 0,90 $/km) — the CDC
  fixes the merchant side and says nothing about couriers. Same for `MAX_PICKUP_DISTANCE_KM`.
- **Route geometry and ETA are still straight-line.** `legDurationMin` uses average city
  speeds over crow-flies distance, as the mock did. The plan calls for a Mapbox Directions
  call at pickup; that needs `MAPBOX_SECRET_TOKEN`, which is unset.
- **The payout step of courier registration is deliberately not accepted.** The mobile form
  collects a bank transit and account number; this endpoint refuses them. Raw bank details
  are never this database's to hold — Stripe Connect collects them in Phase 7.

## Phase 6 — done (2026-09-03)

Mostly a closing of loops, and one serious security finding.

**The `admin` role finally exists.** `AdminGuard` pairs with `SupabaseAuthGuard` (always
second — it reads the `userId` the first one sets), and `private.is_admin()` does the same job
in RLS. The role is read from `profiles.role` rather than a JWT claim on purpose: a token
outlives a role change, so an administrator whose access is revoked would keep it until their
session expired. An admin is made by an `update … set role = 'admin'` run with the
service-role key — no endpoint grants it, and `PATCH /me/role` accepts only the three consumer
roles.

**Disputes can be settled.** This is where the mock ran out of *model*, not screens:
`OrderDispute.status` was `'open' | 'answered'` with no value for settled, because nothing in
the app was entitled to settle one. `PATCH /admin/disputes/:orderId/resolve` takes
`resolved`/`rejected`, requires a note (a dispute closed with no reasoning is one nobody can
defend three months later), and optionally refunds.

**Courier issues can be closed.** `CourierIssue` had no status field at all — a courier could
report that nobody answered the door and the report sat there forever. Both the reporting
endpoint (`POST /couriers/me/runs/:orderId/issue`, the port of `reportCourierIssue`) and the
admin resolution now exist. Resolving deliberately does **not** touch the order's status: a
courier outside a locked building still has someone's dinner, and the order is not resolved
until it is somewhere.

**Refunds move real money**, and `LoyaltyService.reverseForOrder` finally has the caller it
was written for in Phase 4. Ordering is deliberate: Stripe first, database second. The reverse
can leave an order marked refunded that Stripe declined, and an order claiming it returned
money it did not is worse than one briefly out of date. Only the *earn* is reversed — points a
shopper spent on the order stay spent, because handing them back alongside a cash refund pays
twice for one order.

`GET /admin/stats` covers CDC §04's "supervision générale", including the number that actually
needs watching: orders that are `ready`, paid for, and have nobody carrying them.

### The finding: any signed-in user could make themselves an administrator

Found by running the attack while verifying Phase 6's admin boundary — a shopper executed

    update profiles set role = 'admin' where id = auth.uid()

over PostgREST, successfully, and the role stuck.

It is **exactly** the bug `0009` fixed for vendor self-approval, on a table that was not
re-audited when that lesson was learned. `profiles_update_own` (from Phase 1's `0005`)
correctly scopes the row; RLS cannot scope columns; Supabase's default grants hand
`authenticated` table-wide UPDATE on all ten. `vendor_id` and `courier_id` were the same hole
one step down — repointing them at another merchant's shop is how you read their orders.

It was survivable while `role` only chose a home screen. **Phase 6 is what made it critical**:
an administrator resolves other people's disputes and issues Stripe refunds. Fixed in
`0022_identity_column_privileges` with a three-column UPDATE grant, and re-verified: promoting
to admin, claiming someone's shop, rewriting the referrer and deleting the profile are all
DENIED, while renaming yourself still works.

The lesson worth carrying into Phase 7: **every table with a policy written before `0009`
needs the same column-grant audit.** `addresses` and the favourites tables were checked and
are genuinely fine (every column on them is the user's own to write); `profiles` was the one
that was not.

### Verified

- `tsc`, lint, build, no drift; 111 tests; 72 routes; every `/admin` route 401s without a
  token.
- **Three-role visibility, live**: the admin sees the platform's orders, disputes, vendors and
  couriers; the shopper sees only their own order and dispute; the merchant sees the order
  placed with their shop. Admin access is a *separate* policy on each table rather than a
  widened owner rule — Postgres ORs permissive policies, so the ownership rules are untouched
  and the admin grant can be read and revoked on its own.
- `get_advisors(security)`: zero WARN. `courier_issues` and `disputes` are off the no-policy
  list; the seven remaining INFO entries are all tables whose grants are fully revoked
  (`coupons`, `platform_settings`, …) or Phase 7/9 domain.

**Not done**: the orphaned-payment case — a payment that succeeded with no order row at all,
because the order transaction rolled back — is still log-only. There is no row to address, so
it is refunded from the Stripe dashboard; the webhook's reconciliation warning is what
surfaces it. Building a table for it before it has happened once seemed like the wrong trade.

## Phase 8 — done (2026-09-03)

The approval queues, the users directory, and the settings the client brief always said an
administrator would edit. Phase 6 had already built the `admin` role and the disputes half,
so this completes it.

**`rejected` is a new status, and deliberately not `suspended`** (`drizzle/0023`). The mock
had three values because the app only ever needed three; the CDC asks an administrator to
"approve or reject" a file after reading the paperwork. Folding a rejection into `suspended`
would tell a merchant that a shop they never opened had been taken offline — on their own
screen, and in whatever an auditor reads six months later.

**The transitions are a table, and the interesting part is what it forbids** (7 tests):
- A **rejected file cannot be approved**. Rejection is a decision about paperwork that was
  found wanting; the way back is a fresh application, not an administrator toggling it later.
- A **pending file cannot be suspended**. Suspension takes something away from someone who
  had it.
- An **approved shop cannot be rejected** — there is a decision for that and it is "suspend";
  rejecting would erase the fact it ever traded.
- **Nothing returns to `pending`**, and **approving twice is refused** rather than silently
  accepted — a second approval would overwrite the reviewer and timestamp that are the audit
  trail.

**Every rejection and suspension requires a stated reason**, enforced at the route rather
than in the schema (approve/reject/suspend share one body and only the destination knows
which decision it is). A merchant told only "rejected" has nothing to fix and nothing to
appeal. `reviewed_by` and `reviewed_at` record who decided and when.

**Suspending a courier takes them off shift in the same write.** Otherwise a suspended
courier stays in the dispatch pool until they happen to toggle it themselves — which a
suspended courier has no reason to do.

**`PATCH /admin/settings`** is the button the brief asked for. `DOUBLE_POINTS_ACTIVE` shipped
in the mobile app as a hardcoded `false` with a comment saying the toggle belonged to a back
office; it is now a real toggle with a start/end window (Phase 4), editable here along with
every loyalty rate and the CDC's commission rate and subscription fee.

This replaces `useDemoShopApproval` and `useDemoCourierApproval` in the mobile app, which the
mock's own comments describe as "a stand-in for the administrator" — they flipped a shop to
approved on a timer so a demo could continue. Nothing else ever set these statuses, which is
why `suspended` existed with no code path reaching it.

### Verified

- `tsc`, lint, build, no drift; **118 tests** (12 files); 83 routes; every `/admin` route
  401s without a token.
- **The approval gate, live**: a shopper sees **0** of a pending shop, **1** the moment it is
  approved, and **0** again once it is rejected. That gate is the whole point of the
  registration queue and nothing else in the platform enforces it.
- A migration-tooling detail worth recording: `ALTER TYPE … ADD VALUE` cannot have its new
  value *used* in the same transaction, and hand-written migrations do not update Drizzle's
  snapshot — so the review columns were reconciled onto Drizzle's own generated migration
  rather than kept as hand-written files, and the FK constraint names were renamed to match
  what it expects. Otherwise CI's schema-drift check would have failed on every future build
  for a purely cosmetic difference.

**Not done**: there is **no audit log**. `reviewed_by`/`reviewed_at` record the *current*
decision on a file, and settings changes record nothing at all — an admin can change the
commission rate and nothing says who or when. That is a real gap for Phase 10, and the right
fix is an `admin_audit_log` table rather than more columns on each row.

## Column-grant audit (2026-09-03) — two more findings

Run because Phase 6's `profiles` escalation showed "RLS is the only gate" is a *class* on
this project, not a one-off. One query over `information_schema.role_column_grants` names
every table where a write grant covers every column; it is kept in
`drizzle/0024_column_grant_audit_fixes.sql` so the next audit is a copy-paste.

**1. `addresses.lat`/`lng` were self-editable, and that costs money.** Demonstrated as a live
exploit, not a theoretical grant: the row's owner moved their own coordinates to 0.03 km from
a shop, dropping the delivery fee from **8,99 $ to 2,99 $**, while `street`/`city`/`postal_code`
— where the courier is actually sent — still read an address **16 km away**. The courier is
who pays for it: `order_deliveries.distance_km` and therefore `earnings_cad` come from the
same coordinates, so they drive 16 km and are paid for 0.03. Revoked outright — there is no
coherent column subset, since editing `city` without re-deriving coordinates is the same bug.

**2. The Phase 2 fix for `products.vendor_id` had silently done nothing.** `0009` ran
`revoke update (vendor_id) …`, and **Postgres ignores a column-level revoke while a
table-level grant stands**. The `vendors` fix in that same migration got it right (revoke the
table grant, then grant columns back); the `products` line did not, and the audit found the
column still updatable eleven migrations later. Nothing was exploitable through it — the
policy's `WITH CHECK` refuses a `vendor_id` the caller doesn't own — but a fix that reads as
applied and isn't is worse than no fix, because it stops anyone looking again.

Also revoked blanket write grants on `categories`, `merchant_subscriptions` and `support_*`,
where RLS was refusing writes only because no permissive policy happened to exist yet.
`favorite_*`, `vendor_categories`, `vendor_hours` and `vendor_sections` were checked and
**deliberately left**: every column on them genuinely belongs to the row's owner, and
`vendor_id` is already pinned by each policy's `WITH CHECK`.

## Phase 7 — done except the Stripe round-trip (2026-09-03)

Everything is written and booted; **no Stripe call has been made**, because there is still no
key. What that means per piece is called out below rather than averaged into a status.

**Merchant analytics** (`GET /vendors/me/analytics`) — the SQL port of `lib/analytics.ts`,
and fully verified live. **Revenue is the product subtotal, not the order total**: on
fixtures it reports **150,00 $** where `total_cad` would have said **180,45 $**, a 20 %
overstatement. The mobile app's own comment explains why — the delivery fee pays the courier
and TPS/TVQ are collected for the government, and a dashboard calling either "Recettes" lies
to the merchant. Cancelled orders are excluded from revenue and still counted in
`statusCounts` (a shop needs its cancellation rate); a 999 $ cancelled order contributed
nothing. The commission rate is read from `platform_settings`, so Phase 8's admin toggle
actually moves it.

**The 12 % split** rides on the PaymentIntent as `application_fee_amount` +
`transfer_data.destination` — a destination charge, so Stripe settles the merchant's share
itself. Taken **on the subtotal**, for the same reason the analytics are: the CDC says
"calculée sur le montant de la vente", and taxes and delivery are not the merchant's sale.
The split is attached **only once the merchant has a Connect account** — charging a fee
toward an account that cannot receive it fails the whole payment, which would mean an
approved shop unable to sell until its banking was finished.

**Connect onboarding** for merchants and couriers, Express accounts so Stripe hosts the
banking and identity verification. Resumable — people abandon it halfway, and the account id
is stored on first creation so a second attempt continues rather than stranding the first.
Status is asked of Stripe rather than read from our row, because `charges_enabled` flips when
Stripe finishes verifying and does not tell us. `merchant_subscriptions.status` is
deliberately **not** used for onboarding state: it tracks the 70 $/month, and one is how a
merchant gets paid while the other is what they pay.

**Courier payouts** — the thing the mock had no equivalent of at all. `pendingPayoutCad` and
`nextPayoutDate` in `lib/courierAnalytics.ts` are a read-only projection; nothing ever moved a
cent. Money now leaves as a Stripe **Transfer** to the courier's Connect account, Friday 03:00
Montreal (matching `PAYOUT_WEEKDAY`). Three decisions worth keeping:
- **"Owed" is `paid_out_at is null` on the run**, not a date range. A run missed by a failed
  batch appears in the next one; anything keyed on "since last Friday" would drop it forever.
- **Transfer first, then mark paid.** The reverse can mark runs settled that Stripe rejected,
  and a courier whose unpaid runs read as paid has no way to notice.
- **Per-courier idempotency key** (`payout:<courier>:<date>`), so a retried batch cannot pay
  twice — which is the whole reason the ordering above is safe.
- One courier's missing onboarding is logged and skipped, never fatal: it must not stop
  everyone else being paid.

`drizzle/0026` gives both money tables RLS — each party reads their own, **neither writes**.
A courier who could set `courier_payouts.status = 'paid'` is a courier marking their own
invoice settled.

**Verified**: `tsc`, lint, build, no drift; 118 tests; **90 routes**; analytics proven against
live fixtures; `get_advisors` zero WARN with both new tables off the no-policy list.

**Not verified — and this is now the largest untested surface in the project.** Every Stripe
call (`createIntent` with a split, `createConnectAccount`, `createAccountLink`,
`getConnectAccount`, `transfer`, `refund`) is typed, booted and reachable, and **none has ever
run**. The weekly payout job logs an explicit error rather than throwing when the key is
missing, so an unpaid courier has a findable cause. Phase 3's review gate has still never been
walked either.

## Needed from you before this app can actually run for real

1. ~~**`DATABASE_URL`**~~ — **no longer needed.** The data layer is PostgREST; the
   project URL plus the service-role key are the database credentials. This was the
   longest-standing blocker on this list and it was removed by changing the
   architecture rather than by obtaining the password.
2. ~~**`MAPBOX_SECRET_TOKEN`**~~ — already present; the mobile repo's `.env` carried an
   `sk.` token as `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` and it geocodes. ⚠️ One secret is
   doing two jobs: rotating it for the mobile build would silently stop server-side
   geocoding. A dedicated server token before launch.
3. **Stripe Connect** must be switched on at dashboard.stripe.com/connect —
   `accounts.create` is refused until it is, which blocks Phase 7's gate.
4. **A `STRIPE_WEBHOOK_SECRET`** (`whsec_…`), for the webhook half.
5. A decision on where this deploys (Phase 0's review gate calls for "a deployed, even
   dev-box, instance" — not done yet, blocked on this choice).
6. Apple Developer / Google Play accounts the client owns — not blocking API work,
   blocking store publishing.

## Next: the mobile cutover, then Phase 9

**The API is no longer the bottleneck.** It builds, 248 unit tests pass, and five
committed gates run against the live project. What has never happened is a request
from the actual app: every mobile screen still reads the mock `data/api/*` layer.
That cutover is now genuinely unblocked — the app can use the same Supabase project
with the anon key, and this API is reachable.

Remaining Stripe walkthrough steps, in order of risk:

1. ~~`POST /orders/payment-intent` → confirm with a test card → `POST /orders`~~ —
   **both halves now walked.** `verify:stripe` proved the payment path (12/12) and
   `verify:orders` the order-writing half (17/17), including the rollback when a line
   sells out mid-checkout.
2. `POST /vendors/me/stripe/onboard` → finish Stripe's hosted flow → `GET .../status` shows
   `chargesEnabled`.
3. A paid order on an onboarded merchant → the Stripe dashboard shows the **12 % of subtotal**
   application fee, not 12 % of the total.
4. `POST /admin/payouts/run` with an onboarded courier → a real test Transfer; run it twice
   and confirm the idempotency key refuses the second.
5. `POST /admin/orders/:id/refund` → money back, and the loyalty earn reversed.
6. The webhook, with Stripe's CLI forwarding real signed events.

Then **Phase 9** (FCM push + the OpenAI support assistant — the least specified line in the
whole contract; it needs a scoping conversation before it can be estimated) and **Phase 10**
(rate limiting, observability, load testing, the deploy pipeline, and the security review).

Phase 10 should also pick up the three things this build deferred on purpose: the
**`admin_audit_log`** table (nothing records who changed a commission rate), the
**single-instance schedulers** (dispatch and payouts both assume one replica — see the note in
`dispatch.scheduler.ts`), and **referral phone verification**, which is the one anti-fraud gate
the brief asks for and nothing enforces.
