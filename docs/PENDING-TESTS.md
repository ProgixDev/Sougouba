# Pending tests — account deletion, ratings and coupons

Written 2026-11-19. Both features are implemented in code but **neither has been
tested against the real database**: we had no access to the Supabase project
(`wyjkaiquugoblvvzpjnq`) at the time. Work through this file once access is
granted, then delete it.

| Feature | Code | Needs a migration | Branch state |
|---|---|---|---|
| Account deletion | done | no | committed on `dev` (`ccb42ed`) |
| Ratings / reviews | done | **yes — `api/drizzle/0036_order_reviews.sql`** | committed on `dev` |

What was verified without the database: typecheck and lint on the API and the
mobile app, 282 API unit tests, and the migration itself run in a throwaway
local Postgres with stand-in tables (averages, refusals, grants).

---

## 0. Before testing

- [ ] Get invited to the Supabase project (Organization → Team).
- [ ] Use **throwaway accounts** for everything below. The database is shared
      with the TestFlight app, and account deletion is permanent.
- [ ] Local API running (`cd api && npm run start:dev`), mobile app reloaded.

---

## 1. Apply the ratings migration

- [ ] Apply `api/drizzle/0036_order_reviews.sql` to the project (Supabase SQL
      editor or MCP `apply_migration`). Remove the `--> statement-breakpoint`
      markers if the tool rejects them.
- [ ] Table exists with RLS on:
      ```sql
      select relrowsecurity from pg_class where oid = 'public.order_reviews'::regclass;  -- t
      ```
- [ ] **`anon` cannot call the function** — check by calling it, not by reading
      the file (project rule, see `HANDOVER.md` §8):
      ```bash
      curl -i -X POST "$SUPABASE_URL/rest/v1/rpc/order_review_submit" \
        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d '{"p_customer_id":"00000000-0000-0000-0000-000000000000","p_order_id":"00000000-0000-0000-0000-000000000000","p_vendor_rating":5}'
      ```
      Expected: `401`/`403`/`404` with a permission error — **not** `SGB05`.
      Repeat with a signed-in user's token (`authenticated`).
- [ ] `anon` and `authenticated` cannot read the table:
      `GET $SUPABASE_URL/rest/v1/order_reviews?select=*` → permission denied or `[]`.
- [ ] Regenerate `api/src/db/database.types.ts` (it was edited by hand for
      `order_reviews` and `order_review_submit`) and confirm `tsc` still passes.
- [ ] Run the security advisors and check nothing new is flagged.
- [ ] Once applied everywhere, remove the missing-table tolerance in
      `api/src/orders/order-view.ts` (`reviewsFor`, `MISSING_TABLE`).

---

## 2. Ratings — test plan

Endpoint: `POST /orders/:id/review` with
`{ "vendorRating": 1-5, "courierRating"?: 1-5, "comment"?: string ≤ 1000 }`.

### API

| # | Case | Expected |
|---|---|---|
| R1 | Customer reviews their own **delivered** order, shop 5 + courier 4 + comment | `201`, order returned with `review` filled |
| R2 | Same order again | `409` "Vous avez déjà noté cette commande." |
| R3 | Order not yet delivered (`preparing`, `out_for_delivery`) | `400` "Vous pourrez noter cette commande une fois livrée." |
| R4 | Cancelled order | `400` (same message) |
| R5 | Another customer's order id | `404` |
| R6 | `vendorRating` missing, `0`, `6`, `4.5` | `400` with a French message |
| R7 | Comment of 1001 characters | `400` |
| R8 | Shop rating only (no courier rating) | `201`; courier's rating unchanged |
| R9 | Delivered order with **no courier row** (seeded history), courier rating sent | `201`; courier rating ignored, `courierRating` null |
| R10 | No token | `401` |

### Aggregates

- [ ] After R1: `vendors.rating` and `vendors.review_count` equal the average
      and count of that shop's rows in `order_reviews`.
- [ ] `couriers.rating` equals the average of that courier's non-null
      `courier_rating` rows.
- [ ] A seeded shop showing e.g. "4.7 (120)" switches to its real average and
      count on its first review — **expected**, confirm the client is fine with it.
- [ ] Two reviews for the same shop submitted at the same moment (two devices)
      → `review_count` goes up by 2, not 1.

### Who sees what

- [ ] Customer `GET /orders/:id` → `review` has `vendorRating`, `courierRating`, `comment`.
- [ ] Merchant `GET /vendors/me/orders/:id` → `review` has `vendorRating` and
      `comment`, and **no `courierRating`**.
- [ ] Courier's order reads → no `review`.

### Mobile app

- [ ] Customer, delivered order: "Noter la commande" button visible; hidden on
      active and cancelled orders.
- [ ] Sheet: submit disabled until shop stars chosen; courier row only shown
      when the order had a courier.
- [ ] After sending: sheet closes, "Votre avis" section appears, button gone.
- [ ] Refusal (e.g. already rated from another device) is shown inside the sheet.
- [ ] Shop card and shop page show the new average and count.
- [ ] Courier tracking card / courier profile show the new courier rating.
- [ ] Merchant order screen shows "Avis du client" with stars and comment.
- [ ] English and French, light and dark mode, VoiceOver reads "3 sur 5".

### Known limits (not bugs — decide if wanted)

- Reviews cannot be edited or deleted; no admin moderation screen.
- No public list of reviews on the shop page, only average and count.
- No push notification to the merchant when a review arrives.
- Ratings are not in `CDC Sougouba.pdf` or the contract — confirm with the client.

---

## 3. Account deletion — test plan

Endpoint: `DELETE /me` → `204`. Button "Supprimer mon compte" under sign-out on
the three profile screens. Code: `api/src/me/account-deletion.service.ts`,
`hooks/useDeleteAccount.ts`. No migration needed.

### Refusals

| # | Case | Expected |
|---|---|---|
| D1 | Customer with an order in progress | `409` "Vous avez une commande en cours…", nothing deleted |
| D2 | Merchant whose shop has an unfinished order | `409` "Votre commerce a des commandes en cours…" |
| D3 | Courier carrying an undelivered order | `409` "Terminez votre livraison en cours…" |
| D4 | Admin account | `403` |
| D5 | No token | `401` |

### Customer deletion

Create a throwaway customer with an address, a favourite, a past delivered
order, an avatar and (if possible) a support conversation. Delete it, then check:

- [ ] App returns to the welcome screen; cart and favourites are empty.
- [ ] `profiles` row still exists with `full_name = 'Compte supprimé'`, `avatar_url` null.
- [ ] No rows left in `addresses`, `favorite_products`, `favorite_vendors`,
      `push_tokens`, `support_conversations` (and their messages),
      `email_verification_codes` for that user/email.
- [ ] Past `orders` rows still exist with `customer_name` null; the merchant's
      order history shows the generic customer label.
- [ ] `loyalty_transactions` and `coupon_redemptions` still exist (kept on purpose).
- [ ] Avatar file removed from the `avatars` bucket.
- [ ] In Supabase Auth the user is soft-deleted (`deleted_at` set, email hashed).
- [ ] Signing up again with the **same email** creates a brand-new, empty account.
- [ ] The old session on a second device stops working (refresh fails).

### Courier deletion

- [ ] `couriers` row kept: name "Compte supprimé", phone empty, plate / licence /
      postal code / photo null, `is_online` false, `status = 'suspended'`,
      `status_reason` set.
- [ ] `courier_insurance` and `courier_locations` rows gone.
- [ ] Courier no longer receives dispatch offers.
- [ ] Past `order_deliveries` and `courier_payouts` rows still exist.

### Merchant deletion

- [ ] `vendors` row kept with `status = 'suspended'`; the shop disappears from
      the customer catalogue and search.
- [ ] `vendor_registrations`: contact name/phone blanked, the four document
      paths and `payout_method` null; NEQ / GST / QST kept.
- [ ] Files under `merchant-documents/applications/<ownerId>/` removed.
- [ ] Products and past orders still exist; customers' old orders still open.

### Robustness

- [ ] Kill the API midway (or force an error) and tap delete again → it completes.
- [ ] Check API logs for `Could not list …` / `Could not empty …` storage warnings.

### Known gaps to decide on

- **Sign in with Apple**: Apple expects the Apple token to be revoked on
  deletion. Not implemented (needs the Apple key on the server). Likely required
  for App Store review if Apple sign-in stays enabled.
- Past orders keep the **delivery address**; only the name is removed.
- Courier `base_lat` / `base_lng` remain (columns are `NOT NULL`).
- An admin can re-approve a deleted shop or courier from the back office.
- The deleted user's current access token still passes the API guard until it
  expires (up to about an hour).
- Review comments written by the deleted customer are not cleared.
- Demo/seeded data: the confirmation text mentions points being lost — check
  the wording with the client.

---

## 4. Merchant coupons — test plan

Decided 2026-11-19: **the merchant creates coupons for their own shop**, because
the merchant pays for the discount. Discount on products only, one coupon per
order. No migration needed (the `coupons` table already existed).

Endpoints: `GET /vendors/me/coupons`, `POST /vendors/me/coupons`,
`POST /vendors/me/coupons/:id/deactivate`. App: merchant profile → "Codes promo".
Code: `api/src/loyalty/merchant-coupons.*`, `app/(business)/coupons.tsx`.

| # | Case | Expected |
|---|---|---|
| C1 | Approved merchant creates `ETE10`, 10 %, 30 days | `201`; appears in the list as "Actif" |
| C2 | Same code again (same or other shop, any letter case) | `409` "Ce code est déjà utilisé…" |
| C3 | Pending / suspended shop creates a code | `403` |
| C4 | Account with no shop | `404` |
| C5 | Percentage `0`, `91`, `12.5`; fixed `0`, `500.01` | `400` with a French message |
| C6 | Code with space, accent, `%`, under 3 or over 20 characters | `400` |
| C7 | Deactivate own code | `200`, `active: false`; second call still `200` |
| C8 | Deactivate another shop's coupon id | `404` |

- [ ] Customer applies the code at **that shop's** checkout → discount on the
      product subtotal only; taxes and delivery unchanged.
- [ ] Same code at **another shop** → "Ce code promo ne s'applique pas à cette boutique".
- [ ] Code with `usageLimit: 1` → second order refused; the list shows "Utilisé 1 fois sur 1" and "Terminé".
- [ ] Deactivated or expired code → refused at checkout.
- [ ] After an order with a coupon, `used_count` went up by one (done inside `order_place`).
- [ ] In Stripe: the merchant receives the discounted total minus 12 % of the
      **full** subtotal — i.e. the merchant funds the discount. Confirm this is
      what the client wants; the in-app note tells merchants so.

Not built: editing a code, a per-customer limit, platform-funded coupons, an
admin view of all coupons.

---

## 5. Release steps once all pass

1. Deploy the API to Vercel **after** the migration is applied.
2. Ship the app change: OTA (`npm run update:prod`, iOS) — no native change was made.
3. Add both features to `HANDOVER.md` §2 and remove this file.
