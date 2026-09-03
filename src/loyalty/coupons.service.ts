import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { couponRedemptions, coupons } from '../db/schema/index.js';
import type { ApplicableCoupon } from '../orders/pricing.js';

type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

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

    const [coupon] = await this.db
      .select()
      .from(coupons)
      // Codes are compared case-insensitively: a shopper typing "bienvenue10"
      // from a poster that reads "BIENVENUE10" has entered the right code.
      .where(sql`upper(${coupons.code}) = ${normalized}`)
      .limit(1);
    if (!coupon) throw new NotFoundException('Code promo inconnu');

    if (coupon.startsAt && now < coupon.startsAt) throw new BadRequestException("Ce code promo n'est pas encore actif");
    if (coupon.endsAt && now >= coupon.endsAt) throw new BadRequestException('Ce code promo a expiré');

    if (coupon.vendorId && coupon.vendorId !== context.vendorId) {
      throw new BadRequestException("Ce code promo ne s'applique pas à cette boutique");
    }

    // Advisory only: the binding check is the atomic increment in `redeem`.
    // This one exists so a quote shows the right total instead of promising a
    // discount that will be refused at checkout.
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Ce code promo a atteint sa limite');
    }

    return {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
    };
  }

  /** `resolve`, but returning null instead of throwing — for a quote, where an invalid code should not fail the whole price. */
  async tryResolve(code: string | undefined, context: { vendorId: string }): Promise<ApplicableCoupon | null> {
    if (!code) return null;
    return this.resolve(code, context);
  }

  /**
   * Record that this order used this coupon.
   *
   * Written inside the order's transaction, and the usage limit is enforced
   * *here* rather than by the count in `resolve`: a check-then-insert lets the
   * last unit of a limited coupon be claimed by two simultaneous checkouts.
   * The insert only proceeds while the ledger it is counting still has room,
   * which is a rule Postgres evaluates atomically.
   */
  async redeem(tx: DbOrTx, input: { code: string; customerId: string; orderId: string }): Promise<void> {
    const normalized = input.code.trim().toUpperCase();

    // **The claim on the usage limit, and the only thing that actually holds
    // it.** A single UPDATE whose predicate reads the column it increments:
    // Postgres takes a row lock, and a concurrent transaction that was waiting
    // re-evaluates `used_count < usage_limit` against the version the winner
    // committed — so the loser matches no row and gets nothing.
    //
    // The version this replaces (`insert … where (select count(*) …) < limit`)
    // read like it was atomic and was not: under READ COMMITTED each
    // transaction's counting subquery sees its own snapshot, so two concurrent
    // checkouts both saw room for one more. That was demonstrated against this
    // database, not reasoned about.
    const claimed = await tx.execute(sql`
      update ${coupons} c
         set used_count = c.used_count + 1
       where upper(c.code) = ${normalized}
         and (c.usage_limit is null or c.used_count < c.usage_limit)
      returning c.id
    `);
    if (claimed.length === 0) {
      throw new BadRequestException('Ce code promo a atteint sa limite');
    }

    // The audit trail, and the one-coupon-per-order rule (a unique index on
    // `(coupon_id, order_id)`). A conflict here means this order already
    // redeemed this coupon — which `place` never does twice, so it is a real
    // error rather than something to swallow. Throwing rolls back the
    // increment above with it, since both run in the order's transaction.
    const recorded = await tx.execute(sql`
      insert into ${couponRedemptions} (coupon_id, customer_id, order_id)
      values (${(claimed[0] as { id: string }).id}::uuid, ${input.customerId}::uuid, ${input.orderId}::uuid)
      on conflict do nothing
      returning id
    `);
    if (recorded.length === 0) {
      throw new BadRequestException('Ce code promo a déjà été utilisé sur cette commande');
    }
  }
}
