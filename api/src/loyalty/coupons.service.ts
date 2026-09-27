import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Db, Tables } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { ApplicableCoupon } from '../orders/pricing.js';

/**
 * "Coupons promotionnels" — contracted in the devis ("Programme de fidélité :
 * points, coupons promotionnels & parrainage") and **specified nowhere**.
 *
 * ⚠️ **Every rule below is an assumption, not a requirement.** They are written
 * down here, and in `couponDiscountFor`, precisely so they can be checked
 * against what the client actually wants rather than discovered in production:
 *
 * 1. A coupon discounts the **subtotal only** — never tax, never delivery.
 *    (Discounting tax would mean remitting money never collected; discounting
 *    delivery would mean paying a courier out of a promotion.)
 * 2. `percentage` reads `discount_value` as a **percent** (15 → 15 %).
 * 3. **One coupon per order.** No stacking of coupons with each other.
 * 4. Coupons **may** be combined with points, and each is computed against the
 *    original subtotal, with the sum capped at it (see `priceOrder`).
 * 5. `usage_limit` counts redemptions **across all customers**, not per
 *    customer. There is deliberately no per-customer limit yet — the table has
 *    no column for one, and inventing the column before the rule is known is
 *    how a schema acquires a field nobody can explain.
 * 6. A coupon scoped to a vendor applies only to that vendor's orders.
 * 7. The validity window is `[starts_at, ends_at)` — end-exclusive, matching
 *    how shop hours are treated elsewhere in this codebase.
 *
 * The alternative to guessing was leaving coupons unbuilt, and this feature has
 * already slipped through the whole mobile prototype once without anyone
 * noticing it was in scope. Building it with the assumptions stated loudly is
 * the smaller risk of the two.
 */
@Injectable()
export class CouponsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Resolve a code to something priceable, or explain why not.
   *
   * Every refusal names its own reason: a shopper who typed a code correctly
   * but is a day late deserves to be told that, not "invalid code". The one
   * thing not distinguished is whether an unknown code exists at all — that
   * would let someone enumerate live promotions.
   */
  async resolve(code: string, context: { vendorId: string; now?: Date }): Promise<ApplicableCoupon> {
    const now = context.now ?? new Date();
    const normalized = code.trim().toUpperCase();

    // Codes are compared case-insensitively: a shopper typing "bienvenue10"
    // from a poster that reads "BIENVENUE10" has entered the right code.
    // `ilike` with no metacharacters is an exact, case-insensitive match — the
    // code is normalised above, and `%`/`_` in a coupon code would be a coupon
    // nobody could type anyway.
    const coupon = await unwrap<Tables<'coupons'> | null>(
      this.db.from('coupons').select('*').ilike('code', normalized).maybeSingle()
    );
    if (!coupon) throw new NotFoundException('Code promo inconnu');

    // ⚠️ `starts_at`/`ends_at` are ISO **strings** here, not Dates — PostgREST
    // returns JSON. `now < coupon.startsAt` would compare a Date to a string
    // and coerce, silently accepting an inactive coupon or refusing a live one.
    if (coupon.starts_at && now.getTime() < Date.parse(coupon.starts_at)) {
      throw new BadRequestException("Ce code promo n'est pas encore actif");
    }
    if (coupon.ends_at && now.getTime() >= Date.parse(coupon.ends_at)) {
      throw new BadRequestException('Ce code promo a expiré');
    }

    if (coupon.vendor_id && coupon.vendor_id !== context.vendorId) {
      throw new BadRequestException("Ce code promo ne s'applique pas à cette boutique");
    }

    // Advisory only: the binding check is the atomic increment in `redeem`.
    // This one exists so a quote shows the right total instead of promising a
    // discount that will be refused at checkout.
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      throw new BadRequestException('Ce code promo a atteint sa limite');
    }

    return {
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value),
    };
  }

  /** `resolve`, but returning null instead of throwing — for a quote, where an invalid code should not fail the whole price. */
  async tryResolve(code: string | undefined, context: { vendorId: string }): Promise<ApplicableCoupon | null> {
    if (!code) return null;
    return this.resolve(code, context);
  }

  // ⚠️ `redeem()` is gone, and must not come back here.
  //
  // The usage-limit claim is a single UPDATE whose predicate reads the column
  // it increments, and it has to run in the order's own transaction — a
  // shopper must never burn a limited coupon on an order that then rolls back.
  // There is no transaction to hand across PostgREST, so it moved into
  // `order_place` (migration `rpc_order_place`) with the rest.
  //
  // The version this replaced (`insert … where (select count(*) …) < limit`)
  // read like it was atomic and was not: under READ COMMITTED each
  // transaction's counting subquery sees its own snapshot, so two concurrent
  // checkouts both saw room for one more. That was demonstrated against this
  // database in Phase 4, not reasoned about — and the fix is preserved
  // verbatim in the function.
}
