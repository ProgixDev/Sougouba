import { ConflictException, ForbiddenException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import type { Db, Tables } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { CreateCouponInput } from './dto/coupon.dto.js';

/** Postgres's own "unique violation" — here, `coupons_code_unique`. */
const UNIQUE_VIOLATION = '23505';
/** More than a shop will ever run at once; a guard against a runaway script, not a product limit. */
const MAX_COUPONS_PER_SHOP = 200;

export type CouponResponse = {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  /** Whether a shopper typing it right now would get the discount. */
  active: boolean;
};

/**
 * A merchant managing the promo codes for their own shop.
 *
 * `CouponsService` is the read side — it decides whether a code a shopper typed
 * applies. Until this existed nothing wrote the table at all, so that service
 * had been validating against an empty one.
 *
 * Every method resolves the shop from the token. A coupon is never created,
 * listed or ended by id alone: the vendor filter is on every query, so someone
 * else's coupon id answers 404, the same as one that does not exist.
 *
 * There is no edit and no delete. Changing the value of a code that is already
 * printed on a flyer is how a shopper gets a different discount from the one
 * they were promised, and deleting one would orphan the redemptions that
 * reference it. A code is ended, and a new one is made.
 */
@Injectable()
export class MerchantCouponsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(userId: string): Promise<CouponResponse[]> {
    const vendor = await this.ownedVendor(userId);
    const rows = await unwrap<Tables<'coupons'>[]>(
      this.db
        .from('coupons')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false })
        .limit(MAX_COUPONS_PER_SHOP)
    );
    const now = Date.now();
    return rows.map((row) => toResponse(row, now));
  }

  /** One page, newest first, with the total — what the app's list scrolls through. */
  async page(userId: string, limit: number, offset: number) {
    const vendor = await this.ownedVendor(userId);
    const { data, count, error } = await this.db
      .from('coupons')
      .select('*', { count: 'exact' })
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException('Database request failed');
    const now = Date.now();
    return { items: (data ?? []).map((row) => toResponse(row as Tables<'coupons'>, now)), total: count ?? 0, limit, offset };
  }

  async create(userId: string, input: CreateCouponInput): Promise<CouponResponse> {
    const vendor = await this.ownedVendor(userId);
    // A pending or suspended shop takes no orders, so a code for it could only
    // ever be advertised and then refused.
    if (vendor.status !== 'approved') {
      throw new ForbiddenException('Votre boutique doit être approuvée pour créer un code promo.');
    }

    // Codes are matched case-insensitively at checkout (`CouponsService.resolve`
    // uses `ilike` and expects at most one row), but the unique constraint is
    // case-sensitive. Codes created here are always upper-case; this also
    // catches a hand-inserted "bienvenue10" the constraint would let through.
    const taken = await unwrap<{ id: string }[]>(
      this.db.from('coupons').select('id').ilike('code', input.code).limit(1)
    );
    if (taken.length > 0) throw new ConflictException(CODE_TAKEN);

    const now = new Date();
    const { data, error } = await this.db
      .from('coupons')
      .insert({
        code: input.code,
        discount_type: input.discountType,
        discount_value: input.discountValue,
        vendor_id: vendor.id,
        starts_at: now.toISOString(),
        ends_at: input.validDays ? new Date(now.getTime() + input.validDays * DAY_MS).toISOString() : null,
        usage_limit: input.usageLimit ?? null,
      })
      .select('*')
      .single();
    if (error) {
      // Two shops picking the same code in the same second: the check above
      // passed for both, the constraint refuses one.
      if (error.code === UNIQUE_VIOLATION) throw new ConflictException(CODE_TAKEN);
      await unwrap(Promise.resolve({ data: null, error }));
    }
    return toResponse(data as Tables<'coupons'>, now.getTime());
  }

  /**
   * Ends a code now. Idempotent: ending one that already ran out leaves its
   * original end date alone, so the list keeps saying when it really stopped.
   */
  async deactivate(userId: string, couponId: string): Promise<CouponResponse> {
    const vendor = await this.ownedVendor(userId);
    const existing = await unwrap<Tables<'coupons'> | null>(
      this.db.from('coupons').select('*').eq('id', couponId).eq('vendor_id', vendor.id).maybeSingle()
    );
    if (!existing) throw new NotFoundException('Code promo introuvable');

    const now = new Date();
    if (existing.ends_at && Date.parse(existing.ends_at) <= now.getTime()) {
      return toResponse(existing, now.getTime());
    }

    const updated = await unwrap<Tables<'coupons'>>(
      this.db
        .from('coupons')
        .update({ ends_at: now.toISOString() })
        .eq('id', couponId)
        .eq('vendor_id', vendor.id)
        .select('*')
        .single()
    );
    // `ends_at` is exclusive, and it was just set to "now" — a millisecond on,
    // so the answer says inactive rather than depending on the clock's grain.
    return toResponse(updated, now.getTime() + 1);
  }

  private async ownedVendor(userId: string): Promise<{ id: string; status: string }> {
    const row = await unwrap<{ id: string; status: string } | null>(
      this.db.from('vendors').select('id, status').eq('owner_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no shop');
    return row;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_TAKEN = 'Ce code est déjà utilisé. Choisissez-en un autre.';

/** Same three conditions `CouponsService.resolve` refuses on, so the list never calls a dead code live. */
export function isCouponActive(
  coupon: { startsAt: string | null; endsAt: string | null; usageLimit: number | null; usedCount: number },
  nowMs: number
): boolean {
  if (coupon.startsAt && nowMs < Date.parse(coupon.startsAt)) return false;
  if (coupon.endsAt && nowMs >= Date.parse(coupon.endsAt)) return false;
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return false;
  return true;
}

function toResponse(row: Tables<'coupons'>, nowMs: number): CouponResponse {
  const coupon = {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    // `numeric` reaches JSON as a string through PostgREST.
    discountValue: Number(row.discount_value),
    usageLimit: row.usage_limit,
    usedCount: row.used_count,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
  return { ...coupon, active: isCouponActive(coupon, nowMs) };
}
