import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Page } from '../catalog/dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrapRpc } from '../db/unwrap.js';
import type {
  AdminCouponQuery,
  AdminProductQuery,
  AdminReviewQuery,
  ModerateReviewInput,
} from './dto/admin.dto.js';

export interface AdminReview {
  orderId: string;
  vendor: { id: string; name: string } | null;
  customerName: string | null;
  courierName: string | null;
  vendorRating: number;
  courierRating: number | null;
  comment: string | null;
  createdAt: string;
  commentHiddenAt: string | null;
  removedAt: string | null;
  moderationReason: string | null;
}

export interface AdminCoupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  vendor: { id: string; name: string } | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
  /** Live right now: started, not ended, and not used up — the rule checkout applies. */
  active: boolean;
}

export interface AdminProduct {
  id: string;
  name: string;
  priceCad: number;
  imageUrl: string;
  isAvailable: boolean;
  stockQty: number;
  vendor: { id: string; name: string; status: string } | null;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
}

const NOT_FOUND = 'SGB05';
const ALREADY = 'SGB06';

/**
 * The back office's moderation of what merchants and customers write:
 * review comments, merchant promo codes, product listings.
 *
 * Reads here; every write goes through one SQL function that applies the
 * change and its audit line together (`0041_admin_moderation.sql`).
 */
@Injectable()
export class ModerationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ── reviews ─────────────────────────────────────────────────────────────

  async listReviews(query: AdminReviewQuery): Promise<Page<AdminReview>> {
    let q = this.db
      .from('order_reviews')
      .select(
        `orderId:order_id, vendorRating:vendor_rating, courierRating:courier_rating, comment, createdAt:created_at,
         commentHiddenAt:comment_hidden_at, removedAt:removed_at, moderationReason:moderation_reason,
         vendor:vendors(id, name),
         customer:profiles!order_reviews_customer_id_fkey(fullName:full_name),
         courier:couriers(fullName:full_name)`,
        { count: 'exact' }
      );
    if (query.filter === 'with_comment') q = q.not('comment', 'is', null);
    if (query.filter === 'low') q = q.lte('vendor_rating', 2);
    if (query.filter === 'hidden') q = q.not('comment_hidden_at', 'is', null);
    if (query.filter === 'removed') q = q.not('removed_at', 'is', null);

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw dbError(error);

    return page(
      (data ?? []).map((r: any) => ({
        orderId: r.orderId,
        vendor: one<{ id: string; name: string }>(r.vendor) ?? null,
        customerName: one<{ fullName: string | null }>(r.customer)?.fullName ?? null,
        courierName: one<{ fullName: string | null }>(r.courier)?.fullName ?? null,
        vendorRating: r.vendorRating,
        courierRating: r.courierRating,
        comment: r.comment,
        createdAt: r.createdAt,
        commentHiddenAt: r.commentHiddenAt,
        removedAt: r.removedAt,
        moderationReason: r.moderationReason,
      })),
      count,
      query
    );
  }

  /**
   * Hiding a comment or removing a review needs a reason — it is what the
   * audit log says when someone asks why a shop's average moved. Undoing
   * either does not.
   */
  async moderateReview(adminId: string, orderId: string, input: ModerateReviewInput): Promise<void> {
    const needsReason = input.action === 'hide_comment' || input.action === 'remove';
    if (needsReason && !input.reason) throw new BadRequestException('Un motif est requis pour cette décision');
    await unwrapRpc<void>(
      this.db.rpc('admin_review_moderate', {
        p_admin_id: adminId,
        p_order_id: orderId,
        p_action: input.action,
        p_reason: input.reason ?? '',
      }),
      (error) => refusal(error, 'Review not found', 'Action impossible')
    );
  }

  // ── coupons ─────────────────────────────────────────────────────────────

  async listCoupons(query: AdminCouponQuery): Promise<Page<AdminCoupon>> {
    const now = new Date().toISOString();
    let q = this.db
      .from('coupons')
      .select(
        `id, code, discountType:discount_type, discountValue:discount_value, startsAt:starts_at, endsAt:ends_at,
         usageLimit:usage_limit, usedCount:used_count, createdAt:created_at, vendor:vendors(id, name)`,
        { count: 'exact' }
      );
    if (query.status === 'active') q = q.or(`ends_at.is.null,ends_at.gt.${now}`);
    if (query.status === 'ended') q = q.lte('ends_at', now);
    if (query.search) q = q.ilike('code', containsPattern(query.search));

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw dbError(error);

    const at = Date.now();
    return page(
      (data ?? []).map((c: any) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        vendor: one<{ id: string; name: string }>(c.vendor) ?? null,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        usageLimit: c.usageLimit,
        usedCount: c.usedCount,
        createdAt: c.createdAt,
        active:
          (!c.startsAt || Date.parse(c.startsAt) <= at) &&
          (!c.endsAt || Date.parse(c.endsAt) > at) &&
          (c.usageLimit === null || c.usedCount < c.usageLimit),
      })),
      count,
      query
    );
  }

  async deactivateCoupon(adminId: string, couponId: string, reason: string | undefined): Promise<void> {
    await unwrapRpc<void>(
      this.db.rpc('admin_coupon_deactivate', { p_admin_id: adminId, p_coupon_id: couponId, p_reason: reason ?? '' }),
      (error) => refusal(error, 'Coupon not found', 'Ce code est déjà terminé')
    );
  }

  // ── products ────────────────────────────────────────────────────────────

  /** Every shop's products, hidden ones included — the shopper reads leave those out. */
  async listProducts(query: AdminProductQuery): Promise<Page<AdminProduct>> {
    let q = this.db
      .from('products')
      .select(
        `id, name, priceCad:price_cad, imageUrl:image_url, isAvailable:is_available, stockQty:stock_qty,
         createdAt:created_at, hiddenAt:hidden_at, hiddenReason:hidden_reason, vendor:vendors(id, name, status)`,
        { count: 'exact' }
      );
    if (query.search) q = q.ilike('name', containsPattern(query.search));
    if (query.hidden === 'only') q = q.not('hidden_at', 'is', null);

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw dbError(error);

    return page(
      (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        priceCad: Number(p.priceCad),
        imageUrl: p.imageUrl ?? '',
        isAvailable: p.isAvailable,
        stockQty: p.stockQty,
        vendor: one<{ id: string; name: string; status: string }>(p.vendor) ?? null,
        createdAt: p.createdAt,
        hiddenAt: p.hiddenAt,
        hiddenReason: p.hiddenReason,
      })),
      count,
      query
    );
  }

  async setProductHidden(adminId: string, productId: string, hidden: boolean, reason: string | undefined) {
    await unwrapRpc<void>(
      this.db.rpc('admin_product_set_hidden', {
        p_admin_id: adminId,
        p_product_id: productId,
        p_hidden: hidden,
        p_reason: reason ?? '',
      }),
      (error) => refusal(error, 'Product not found', hidden ? 'Ce produit est déjà masqué' : 'Ce produit est déjà visible')
    );
  }
}

function page<T>(items: T[], count: number | null, query: { limit: number; offset: number }): Page<T> {
  return { items, total: count ?? 0, limit: query.limit, offset: query.offset };
}

function refusal(error: PostgrestError, notFound: string, already: string): never {
  if (error.code === NOT_FOUND) throw new NotFoundException(notFound);
  if (error.code === ALREADY) throw new BadRequestException(already);
  throw dbError(error);
}

function dbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
