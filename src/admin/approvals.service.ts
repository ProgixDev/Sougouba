import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';

import type { Page } from '../catalog/dto/query.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierInsurance, couriers, profiles, vendorRegistrations, vendors } from '../db/schema/index.js';
import type { ReviewDecisionInput, ReviewQuery } from './dto/admin.dto.js';

export type ApplicationStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

/**
 * Which decisions are available from where.
 *
 * Stated as a table rather than as `if`s because the interesting cases are the
 * ones it forbids:
 * - **A rejected file cannot be approved.** Rejection is a decision about
 *   paperwork that was found wanting; the way back is a fresh application with
 *   fixed paperwork, not an administrator toggling it later.
 * - **A pending file cannot be suspended.** Suspension takes something away
 *   from someone who had it; a file that never traded gets rejected instead,
 *   and conflating the two is how a merchant ends up reading that a shop they
 *   never opened has been taken offline.
 * - **Approving twice is refused**, not silently accepted — a second approval
 *   would overwrite the reviewer and timestamp of the first, which is the audit
 *   trail.
 */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  // Reinstating a suspension is the one reversal that makes sense: the shop
  // traded before, and whatever caused the suspension can be resolved.
  suspended: ['approved'],
  rejected: [],
};

export function assertDecision(from: ApplicationStatus, to: ApplicationStatus): void {
  if (from === to) throw new BadRequestException(`This file is already "${from}"`);
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`A "${from}" file cannot be moved to "${to}"`);
  }
}

/**
 * The registration queue — CDC addendum §02's human between "someone applied"
 * and "they are on the platform".
 *
 * This replaces `useDemoShopApproval` and `useDemoCourierApproval` in the
 * mobile app, which the mock's own comments describe as "a stand-in for the
 * administrator": they flipped a shop to approved on a timer so a demo could
 * continue. Nothing else in the app ever set these statuses, which is why
 * `suspended` existed with no code path reaching it.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  // ── merchants ─────────────────────────────────────────────────────────────

  async listVendors(query: ReviewQuery): Promise<Page<unknown>> {
    const where: SQL | undefined = query.status ? eq(vendors.status, query.status) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          id: vendors.id,
          name: vendors.name,
          slug: vendors.slug,
          vendorType: vendors.vendorType,
          city: vendors.city,
          addressStreet: vendors.addressStreet,
          addressPostalCode: vendors.addressPostalCode,
          status: vendors.status,
          statusReason: vendors.statusReason,
          reviewedAt: vendors.reviewedAt,
          createdAt: vendors.createdAt,
          ownerName: profiles.fullName,
          // The paperwork the CDC asks an administrator to actually read before
          // deciding. Owner-only under RLS; readable here because the admin has
          // its own policy (`0021`).
          neq: vendorRegistrations.neq,
          contactName: vendorRegistrations.contactName,
          contactPhone: vendorRegistrations.contactPhone,
          mapaqNumber: vendorRegistrations.mapaqNumber,
          submittedAt: vendorRegistrations.submittedAt,
        })
        .from(vendors)
        .innerJoin(profiles, eq(profiles.id, vendors.ownerId))
        .leftJoin(vendorRegistrations, eq(vendorRegistrations.vendorId, vendors.id))
        .where(where)
        // Oldest application first — a queue is worked from the front.
        .orderBy(asc(vendors.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(vendors).where(where),
    ]);

    return { items: rows, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  }

  async decideVendor(adminId: string, vendorId: string, to: ApplicationStatus, input: ReviewDecisionInput) {
    const [vendor] = await this.db
      .select({ id: vendors.id, status: vendors.status, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);
    if (!vendor) throw new NotFoundException('Vendor not found');
    assertDecision(vendor.status, to);

    const [updated] = await this.db
      .update(vendors)
      .set({
        status: to,
        statusReason: input.reason ?? null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(vendors.id, vendorId), eq(vendors.status, vendor.status)))
      .returning();
    // The status changed under us — two administrators working the same queue.
    if (!updated) throw new BadRequestException('This file was decided by someone else while you were reviewing it');

    this.logger.log(`Admin ${adminId} moved vendor ${vendorId} ("${vendor.name}") from ${vendor.status} to ${to}`);
    return updated;
  }

  // ── couriers ──────────────────────────────────────────────────────────────

  async listCouriers(query: ReviewQuery): Promise<Page<unknown>> {
    const where: SQL | undefined = query.status ? eq(couriers.status, query.status) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          id: couriers.id,
          fullName: couriers.fullName,
          phone: couriers.phone,
          vehicle: couriers.vehicle,
          plate: couriers.plate,
          licenceNumber: couriers.licenceNumber,
          city: couriers.city,
          status: couriers.status,
          statusReason: couriers.statusReason,
          reviewedAt: couriers.reviewedAt,
          isOnline: couriers.isOnline,
          deliveryCount: couriers.deliveryCount,
          joinedAt: couriers.joinedAt,
          insurerName: courierInsurance.insurerName,
          policyNumber: courierInsurance.policyNumber,
          insuranceExpiry: courierInsurance.expiry,
        })
        .from(couriers)
        .leftJoin(courierInsurance, eq(courierInsurance.courierId, couriers.id))
        .where(where)
        .orderBy(asc(couriers.joinedAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(couriers).where(where),
    ]);

    return { items: rows, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  }

  async decideCourier(adminId: string, courierId: string, to: ApplicationStatus, input: ReviewDecisionInput) {
    const [courier] = await this.db
      .select({ id: couriers.id, status: couriers.status, fullName: couriers.fullName })
      .from(couriers)
      .where(eq(couriers.id, courierId))
      .limit(1);
    if (!courier) throw new NotFoundException('Courier not found');
    assertDecision(courier.status, to);

    const [updated] = await this.db
      .update(couriers)
      .set({
        status: to,
        statusReason: input.reason ?? null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        // Losing approval takes them off shift in the same write. Otherwise a
        // suspended courier stays in the dispatch pool until they happen to
        // toggle it themselves — which a suspended courier has no reason to do.
        ...(to === 'approved' ? {} : { isOnline: false }),
      })
      .where(and(eq(couriers.id, courierId), eq(couriers.status, courier.status)))
      .returning();
    if (!updated) throw new BadRequestException('This file was decided by someone else while you were reviewing it');

    this.logger.log(`Admin ${adminId} moved courier ${courierId} ("${courier.fullName}") from ${courier.status} to ${to}`);
    return updated;
  }

  // ── users ─────────────────────────────────────────────────────────────────

  /** The users directory (CDC §04's "supervision"). Read-only — nothing here edits an account. */
  async listUsers(query: { limit: number; offset: number; role?: 'customer' | 'business' | 'courier' | 'admin' }) {
    const where = query.role ? eq(profiles.role, query.role) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          role: profiles.role,
          memberSince: profiles.memberSince,
          vendorId: profiles.vendorId,
          courierId: profiles.courierId,
        })
        .from(profiles)
        .where(where)
        .orderBy(desc(profiles.memberSince))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(profiles).where(where),
    ]);

    return { items: rows, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  }
}
