import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Page } from '../catalog/dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import { authUsersReadonly } from '../db/auth-users.readonly.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  addresses,
  categories,
  courierInsurance,
  courierPayouts,
  couriers,
  orderDeliveries,
  orders,
  profiles,
  vendorCategories,
  vendorHours,
  vendorRegistrations,
  vendorSections,
  vendors,
} from '../db/schema/index.js';
import { AuditService, type AdminAction } from './audit.service.js';
import { num, type AdminCourierDetail, type AdminUserDetail, type AdminVendorDetail } from './dto/admin-detail.dto.js';
import type { ReviewDecisionInput, ReviewQuery, UserQuery } from './dto/admin.dto.js';

export type ApplicationStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

/**
 * Where a decision can land. `pending` is absent because nothing returns to it
 * — `ALLOWED_TRANSITIONS` says so at runtime, and this says so at compile time.
 */
export type ReviewDecision = Exclude<ApplicationStatus, 'pending'>;

/** Which audited action each destination is. Keyed so a new status cannot be added without naming its verb. */
export const AUDIT_ACTION_FOR: Record<'vendor' | 'courier', Record<ReviewDecision, AdminAction>> = {
  vendor: { approved: 'vendor.approve', rejected: 'vendor.reject', suspended: 'vendor.suspend' },
  courier: { approved: 'courier.approve', rejected: 'courier.reject', suspended: 'courier.suspend' },
};

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

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService
  ) {}

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

  /**
   * One merchant file, with everything a reviewer needs to decide it.
   *
   * `documents` folds the three separate path columns into one array with a
   * `kind` discriminator — that is the shape a documents card renders, and it
   * means adding a fourth document later is a backend-only change.
   *
   * ⚠️ Those paths point into the **private** `merchant-documents` bucket, so
   * they are not directly renderable. Signing them is deliberately left out of
   * this change; the card should show a disabled control until it lands.
   */
  async vendorDetail(id: string): Promise<AdminVendorDetail> {
    // `profiles` twice — the owner, and whoever reviewed the file.
    const reviewer = alias(profiles, 'reviewer');

    const [base] = await this.db
      .select({
        id: vendors.id,
        slug: vendors.slug,
        name: vendors.name,
        vendorType: vendors.vendorType,
        specialtyFr: vendors.specialtyFr,
        logoUrl: vendors.logoUrl,
        coverUrl: vendors.coverUrl,
        city: vendors.city,
        neighborhood: vendors.neighborhood,
        addressStreet: vendors.addressStreet,
        addressPostalCode: vendors.addressPostalCode,
        addressLat: vendors.addressLat,
        addressLng: vendors.addressLng,
        rating: vendors.rating,
        reviewCount: vendors.reviewCount,
        deliveryEtaMin: vendors.deliveryEtaMin,
        isHalalCertified: vendors.isHalalCertified,
        status: vendors.status,
        statusReason: vendors.statusReason,
        reviewedAt: vendors.reviewedAt,
        createdAt: vendors.createdAt,
        updatedAt: vendors.updatedAt,
        ownerId: vendors.ownerId,
        ownerName: profiles.fullName,
        ownerEmail: authUsersReadonly.email,
        ownerAvatarUrl: profiles.avatarUrl,
        ownerMemberSince: profiles.memberSince,
        reviewerId: vendors.reviewedBy,
        reviewerName: reviewer.fullName,
        neq: vendorRegistrations.neq,
        contactName: vendorRegistrations.contactName,
        contactPhone: vendorRegistrations.contactPhone,
        mapaqNumber: vendorRegistrations.mapaqNumber,
        submittedAt: vendorRegistrations.submittedAt,
        idDocumentPath: vendorRegistrations.idDocumentPath,
        businessNumberDocumentPath: vendorRegistrations.businessNumberDocumentPath,
        mapaqDocumentPath: vendorRegistrations.mapaqDocumentPath,
      })
      .from(vendors)
      .innerJoin(profiles, eq(profiles.id, vendors.ownerId))
      .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, vendors.ownerId))
      // Left, not inner: a pending file has no reviewer yet.
      .leftJoin(reviewer, eq(reviewer.id, vendors.reviewedBy))
      // Left, not inner: `vendor_registrations` is 1:1-optional.
      .leftJoin(vendorRegistrations, eq(vendorRegistrations.vendorId, vendors.id))
      .where(eq(vendors.id, id))
      .limit(1);

    if (!base) throw new NotFoundException('Vendor not found');

    const [hours, sections, categoryRows, [stats]] = await Promise.all([
      // `day` is 0 = Sunday, matching JS `Date.getDay()`.
      this.db
        .select({ day: vendorHours.day, open: vendorHours.open, close: vendorHours.close, closed: vendorHours.closed })
        .from(vendorHours)
        .where(eq(vendorHours.vendorId, id))
        .orderBy(asc(vendorHours.day)),
      this.db
        .select({ id: vendorSections.id, nameFr: vendorSections.nameFr, position: vendorSections.position })
        .from(vendorSections)
        .where(eq(vendorSections.vendorId, id))
        .orderBy(asc(vendorSections.position), asc(vendorSections.nameFr)),
      this.db
        .select({ id: categories.id, slug: categories.slug, nameFr: categories.nameFr })
        .from(vendorCategories)
        .innerJoin(categories, eq(categories.id, vendorCategories.categoryId))
        .where(eq(vendorCategories.vendorId, id)),
      this.db
        .select({
          productCount: sql<number>`(select count(*) from products where vendor_id = ${id})::int`,
          orderCount: sql<number>`(select count(*) from orders where vendor_id = ${id} and status <> 'cancelled')::int`,
          revenueCad: sql<number>`(select round(coalesce(sum(total_cad), 0), 2) from orders where vendor_id = ${id} and status <> 'cancelled')::float8`,
          lastOrderAt: sql<Date | null>`(select max(created_at) from orders where vendor_id = ${id})`,
          openDisputes: sql<number>`(
            select count(*) from disputes d
            join orders o on o.id = d.order_id
            where o.vendor_id = ${id} and d.status in ('open','answered')
          )::int`,
        })
        .from(sql`(select 1) as _`),
    ]);

    const documents = [
      { kind: 'id' as const, path: base.idDocumentPath },
      { kind: 'business_number' as const, path: base.businessNumberDocumentPath },
      { kind: 'mapaq' as const, path: base.mapaqDocumentPath },
    ].filter((d): d is { kind: 'id' | 'business_number' | 'mapaq'; path: string } => d.path !== null);

    return {
      id: base.id,
      slug: base.slug,
      name: base.name,
      vendorType: base.vendorType,
      specialtyFr: base.specialtyFr,
      logoUrl: base.logoUrl,
      coverUrl: base.coverUrl,
      city: base.city,
      neighborhood: base.neighborhood,
      address: {
        street: base.addressStreet,
        city: base.city,
        postalCode: base.addressPostalCode,
        lat: base.addressLat,
        lng: base.addressLng,
      },
      // `numeric(2,1)` arrives as a string like every other numeric column.
      rating: num(base.rating),
      reviewCount: base.reviewCount,
      deliveryEtaMin: base.deliveryEtaMin,
      isHalalCertified: base.isHalalCertified,
      status: base.status,
      statusReason: base.statusReason,
      reviewedAt: base.reviewedAt,
      reviewer: base.reviewerId ? { id: base.reviewerId, fullName: base.reviewerName ?? '—' } : null,
      owner: {
        id: base.ownerId,
        fullName: base.ownerName,
        email: base.ownerEmail,
        avatarUrl: base.ownerAvatarUrl,
        memberSince: base.ownerMemberSince,
      },
      registration: base.neq
        ? {
            neq: base.neq,
            contactName: base.contactName ?? '',
            contactPhone: base.contactPhone ?? '',
            mapaqNumber: base.mapaqNumber,
            submittedAt: base.submittedAt,
            documents,
          }
        : null,
      categories: categoryRows,
      hours,
      sections,
      stats: {
        productCount: stats?.productCount ?? 0,
        orderCount: stats?.orderCount ?? 0,
        revenueCad: stats?.revenueCad ?? 0,
        lastOrderAt: stats?.lastOrderAt ?? null,
        openDisputes: stats?.openDisputes ?? 0,
      },
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };
  }

  async decideVendor(adminId: string, vendorId: string, to: ReviewDecision, input: ReviewDecisionInput) {
    const [vendor] = await this.db
      .select({ id: vendors.id, status: vendors.status, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);
    if (!vendor) throw new NotFoundException('Vendor not found');
    assertDecision(vendor.status, to);

    // The decision and its audit entry commit together or not at all — an
    // approval nobody is recorded as having made is the gap `admin_audit_log`
    // exists to close, and an entry for a decision that rolled back is worse.
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
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
      if (!row) throw new BadRequestException('This file was decided by someone else while you were reviewing it');

      await this.audit.record(
        {
          actorId: adminId,
          action: AUDIT_ACTION_FOR.vendor[to],
          subjectType: 'vendor',
          subjectId: vendorId,
          subjectLabel: vendor.name,
          reason: input.reason ?? null,
          // The transition itself, not just the destination: "suspended" alone
          // does not say whether a live shop was pulled or a queue was cleared.
          changes: { status: { from: vendor.status, to } },
        },
        tx
      );

      return row;
    });

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

  /**
   * One courier file, plus what they have actually done.
   *
   * ⚠️ `payout` is a **Stripe Connect account**, not bank details. The mobile
   * app's `CourierPayout` type carries `{ bankId, transit, account }`; this
   * database deliberately holds none of that — `db/schema/courier.ts` says raw
   * bank details are never its to hold, Stripe collects them during Connect
   * onboarding. A payout card must render an account id and an onboarding
   * status.
   *
   * `insurance` is null for every bike courier by design, so the card needs an
   * empty state rather than a spinner.
   */
  async courierDetail(id: string): Promise<AdminCourierDetail> {
    const reviewer = alias(profiles, 'reviewer');

    const [base] = await this.db
      .select({
        id: couriers.id,
        userId: couriers.userId,
        fullName: couriers.fullName,
        photoUrl: couriers.photoUrl,
        phone: couriers.phone,
        vehicle: couriers.vehicle,
        plate: couriers.plate,
        licenceNumber: couriers.licenceNumber,
        city: couriers.city,
        postalCode: couriers.postalCode,
        baseLat: couriers.baseLat,
        baseLng: couriers.baseLng,
        rating: couriers.rating,
        deliveryCount: couriers.deliveryCount,
        status: couriers.status,
        statusReason: couriers.statusReason,
        reviewedAt: couriers.reviewedAt,
        isOnline: couriers.isOnline,
        lastSeenAt: couriers.lastSeenAt,
        joinedAt: couriers.joinedAt,
        accountName: profiles.fullName,
        accountEmail: authUsersReadonly.email,
        accountAvatarUrl: profiles.avatarUrl,
        accountMemberSince: profiles.memberSince,
        reviewerId: couriers.reviewedBy,
        reviewerName: reviewer.fullName,
        insurerName: courierInsurance.insurerName,
        policyNumber: courierInsurance.policyNumber,
        insuranceExpiry: courierInsurance.expiry,
        stripeConnectAccountId: courierPayouts.stripeConnectAccountId,
        payoutStatus: courierPayouts.status,
        payoutUpdatedAt: courierPayouts.updatedAt,
      })
      .from(couriers)
      .innerJoin(profiles, eq(profiles.id, couriers.userId))
      .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, couriers.userId))
      .leftJoin(reviewer, eq(reviewer.id, couriers.reviewedBy))
      .leftJoin(courierInsurance, eq(courierInsurance.courierId, couriers.id))
      .leftJoin(courierPayouts, eq(courierPayouts.courierId, couriers.id))
      .where(eq(couriers.id, id))
      .limit(1);

    if (!base) throw new NotFoundException('Courier not found');

    // All the real numbers live on `order_deliveries`, not on the courier row.
    // `unpaidCad` uses exactly the predicate the partial index
    // `order_deliveries_unpaid_idx` was built for, so it is index-served.
    const [stats] = await this.db
      .select({
        runCount: sql<number>`count(*)::int`,
        deliveredCount: sql<number>`(count(*) filter (where ${orderDeliveries.deliveredAt} is not null))::int`,
        earningsTotalCad: sql<number>`round(coalesce(sum(${orderDeliveries.earningsCad}) filter (where ${orderDeliveries.deliveredAt} is not null), 0), 2)::float8`,
        unpaidCad: sql<number>`round(coalesce(sum(${orderDeliveries.earningsCad}) filter (where ${orderDeliveries.paidOutAt} is null and ${orderDeliveries.deliveredAt} is not null), 0), 2)::float8`,
        tipsTotalCad: sql<number>`round(coalesce(sum(${orderDeliveries.tipCad}), 0), 2)::float8`,
        avgDistanceKm: sql<number>`round(coalesce(avg(${orderDeliveries.distanceKm}), 0), 2)::float8`,
        lastDeliveredAt: sql<Date | null>`max(${orderDeliveries.deliveredAt})`,
        openIssues: sql<number>`(
          select count(*) from courier_issues ci
          join order_deliveries d2 on d2.order_id = ci.order_id
          where d2.courier_id = ${id} and ci.status = 'open'
        )::int`,
      })
      .from(orderDeliveries)
      .where(eq(orderDeliveries.courierId, id));

    return {
      id: base.id,
      userId: base.userId,
      fullName: base.fullName,
      photoUrl: base.photoUrl,
      phone: base.phone,
      vehicle: base.vehicle,
      plate: base.plate,
      licenceNumber: base.licenceNumber,
      city: base.city,
      postalCode: base.postalCode,
      base: { lat: base.baseLat, lng: base.baseLng },
      rating: num(base.rating),
      deliveryCount: base.deliveryCount,
      status: base.status,
      statusReason: base.statusReason,
      reviewedAt: base.reviewedAt,
      reviewer: base.reviewerId ? { id: base.reviewerId, fullName: base.reviewerName ?? '—' } : null,
      isOnline: base.isOnline,
      lastSeenAt: base.lastSeenAt,
      joinedAt: base.joinedAt,
      account: {
        id: base.userId,
        fullName: base.accountName,
        email: base.accountEmail,
        avatarUrl: base.accountAvatarUrl,
        memberSince: base.accountMemberSince,
      },
      insurance: base.insurerName
        ? {
            insurerName: base.insurerName,
            policyNumber: base.policyNumber ?? '',
            // Stored as text in `MM/AAAA`, not a date — see the schema.
            expiry: base.insuranceExpiry ?? '',
          }
        : null,
      payout: base.payoutStatus
        ? {
            stripeConnectAccountId: base.stripeConnectAccountId,
            status: base.payoutStatus,
            updatedAt: base.payoutUpdatedAt,
          }
        : null,
      stats: {
        runCount: stats?.runCount ?? 0,
        deliveredCount: stats?.deliveredCount ?? 0,
        earningsTotalCad: stats?.earningsTotalCad ?? 0,
        unpaidCad: stats?.unpaidCad ?? 0,
        tipsTotalCad: stats?.tipsTotalCad ?? 0,
        avgDistanceKm: stats?.avgDistanceKm ?? 0,
        lastDeliveredAt: stats?.lastDeliveredAt ?? null,
        openIssues: stats?.openIssues ?? 0,
      },
    };
  }

  async decideCourier(adminId: string, courierId: string, to: ReviewDecision, input: ReviewDecisionInput) {
    const [courier] = await this.db
      .select({ id: couriers.id, status: couriers.status, fullName: couriers.fullName })
      .from(couriers)
      .where(eq(couriers.id, courierId))
      .limit(1);
    if (!courier) throw new NotFoundException('Courier not found');
    assertDecision(courier.status, to);

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
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
      if (!row) throw new BadRequestException('This file was decided by someone else while you were reviewing it');

      await this.audit.record(
        {
          actorId: adminId,
          action: AUDIT_ACTION_FOR.courier[to],
          subjectType: 'courier',
          subjectId: courierId,
          subjectLabel: courier.fullName,
          reason: input.reason ?? null,
          changes: { status: { from: courier.status, to } },
        },
        tx
      );

      return row;
    });

    this.logger.log(`Admin ${adminId} moved courier ${courierId} ("${courier.fullName}") from ${courier.status} to ${to}`);
    return updated;
  }

  // ── users ─────────────────────────────────────────────────────────────────

  /**
   * The users directory (CDC §04's "supervision"). Read-only — nothing here
   * edits an account.
   *
   * `email` comes from `auth.users` through `authUsersReadonly`, on a **left**
   * join rather than an inner one: a profile whose auth row has gone should
   * still appear in the directory rather than silently vanish from it, since
   * that is exactly the state an administrator would want to notice.
   */
  async listUsers(query: UserQuery) {
    const conditions: SQL[] = [];
    if (query.role) conditions.push(eq(profiles.role, query.role));
    if (query.search) {
      // `containsPattern` is not optional: a bare `%${q}%` with `q = '%'`
      // matches every row and hands over the whole user table. See
      // `common/sql/like.ts`.
      const pattern = containsPattern(query.search);
      conditions.push(or(ilike(profiles.fullName, pattern), ilike(authUsersReadonly.email, pattern))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          email: authUsersReadonly.email,
          role: profiles.role,
          memberSince: profiles.memberSince,
          vendorId: profiles.vendorId,
          courierId: profiles.courierId,
          lastSignInAt: authUsersReadonly.lastSignInAt,
        })
        .from(profiles)
        .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, profiles.id))
        .where(where)
        .orderBy(desc(profiles.memberSince))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(profiles)
        // Repeated because `search` filters on the email — the count must see
        // the same rows the page does, or the page count lies.
        .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, profiles.id))
        .where(where),
    ]);

    return { items: rows, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
  }

  /**
   * One account, in full.
   *
   * ⚠️ The most sensitive read on this API: it hands one person's home
   * addresses, lifetime spend and order history to somebody else. That is what
   * a back office is for and it is guarded accordingly — but anyone adding a
   * field here should weigh whether an administrator genuinely needs it.
   */
  async userDetail(id: string): Promise<AdminUserDetail> {
    // `profiles` is joined twice — once for the account, once for whoever
    // referred them — so the second needs an alias.
    const referrer = alias(profiles, 'referrer');

    const [base] = await this.db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: authUsersReadonly.email,
        avatarUrl: profiles.avatarUrl,
        memberSince: profiles.memberSince,
        role: profiles.role,
        emailConfirmedAt: authUsersReadonly.emailConfirmedAt,
        lastSignInAt: authUsersReadonly.lastSignInAt,
        phone: authUsersReadonly.phone,
        bannedUntil: authUsersReadonly.bannedUntil,
        vendorId: profiles.vendorId,
        courierId: profiles.courierId,
        referredById: profiles.referredBy,
        referrerName: referrer.fullName,
      })
      .from(profiles)
      .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, profiles.id))
      .leftJoin(referrer, eq(referrer.id, profiles.referredBy))
      .where(eq(profiles.id, id))
      .limit(1);

    if (!base) throw new NotFoundException('User not found');

    const [linkedVendor, linkedCourier, addressRows, [activity], [referrals], recentOrders] = await Promise.all([
      base.vendorId
        ? this.db
            .select({ id: vendors.id, name: vendors.name, slug: vendors.slug, status: vendors.status, vendorType: vendors.vendorType })
            .from(vendors)
            .where(eq(vendors.id, base.vendorId))
            .limit(1)
        : Promise.resolve([]),
      base.courierId
        ? this.db
            .select({ id: couriers.id, fullName: couriers.fullName, status: couriers.status, vehicle: couriers.vehicle, isOnline: couriers.isOnline })
            .from(couriers)
            .where(eq(couriers.id, base.courierId))
            .limit(1)
        : Promise.resolve([]),
      this.db
        .select({
          id: addresses.id,
          label: addresses.label,
          street: addresses.street,
          city: addresses.city,
          postalCode: addresses.postalCode,
          lat: addresses.lat,
          lng: addresses.lng,
          isDefault: addresses.isDefault,
        })
        .from(addresses)
        .where(eq(addresses.profileId, id))
        .orderBy(desc(addresses.isDefault)),
      // Cancelled orders excluded: no business happened, and counting them
      // would overstate both the count and the spend.
      this.db
        .select({
          orderCount: sql<number>`count(*)::int`,
          lifetimeSpendCad: sql<number>`round(coalesce(sum(${orders.totalCad}), 0), 2)::float8`,
          lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
        })
        .from(orders)
        .where(and(eq(orders.customerId, id), ne(orders.status, 'cancelled'))),
      this.db
        .select({ referralCount: sql<number>`count(*)::int` })
        .from(profiles)
        .where(eq(profiles.referredBy, id)),
      // The recent list keeps cancellations — "what happened lately" should
      // show an order that fell through, unlike the aggregates above.
      this.db
        .select({
          id: orders.id,
          status: orders.status,
          totalCad: orders.totalCad,
          createdAt: orders.createdAt,
          vendorName: vendors.name,
        })
        .from(orders)
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(eq(orders.customerId, id))
        .orderBy(desc(orders.createdAt))
        .limit(5),
    ]);

    return {
      id: base.id,
      fullName: base.fullName,
      email: base.email,
      avatarUrl: base.avatarUrl,
      memberSince: base.memberSince,
      role: base.role,
      auth: {
        emailConfirmedAt: base.emailConfirmedAt,
        lastSignInAt: base.lastSignInAt,
        phone: base.phone,
        bannedUntil: base.bannedUntil,
      },
      vendor: linkedVendor[0] ?? null,
      courier: linkedCourier[0] ?? null,
      referredBy: base.referredById ? { id: base.referredById, fullName: base.referrerName ?? '—' } : null,
      referralCount: referrals?.referralCount ?? 0,
      addresses: addressRows,
      activity: {
        orderCount: activity?.orderCount ?? 0,
        lifetimeSpendCad: activity?.lifetimeSpendCad ?? 0,
        lastOrderAt: activity?.lastOrderAt ?? null,
        recentOrders: recentOrders.map((o) => ({ ...o, totalCad: num(o.totalCad) })),
      },
    };
  }
}
