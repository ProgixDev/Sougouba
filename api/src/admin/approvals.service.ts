import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Page } from '../catalog/dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { MERCHANT_DOCUMENTS_BUCKET } from '../catalog/media-paths.js';
import { type AdminAction } from './audit.service.js';
import { num, type AdminCourierDetail, type AdminUserDetail, type AdminVendorDetail } from './dto/admin-detail.dto.js';
import type { ReviewDecisionInput, ReviewQuery, UserQuery } from './dto/admin.dto.js';
import { NotifyService } from '../notifications/notify.service.js';

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

/** How long a reviewer's link to a registration document stays valid. */
const DOCUMENT_URL_TTL_SECONDS = 10 * 60;

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
    private readonly notify: NotifyService
  ) {}

  // ── merchants ─────────────────────────────────────────────────────────────

  async listVendors(query: ReviewQuery): Promise<Page<unknown>> {
    // `vendors` points at `profiles` twice (`owner_id`, and `reviewed_by` since
    // 0023), so the embed must name its foreign key: a bare `profiles` is
    // ambiguous and PostgREST refuses the whole query (PGRST201).
    let q = this.db
      .from('vendors')
      .select(
        `id, name, slug, vendorType:vendor_type, city,
         addressStreet:address_street, addressPostalCode:address_postal_code,
         status, statusReason:status_reason, reviewedAt:reviewed_at, createdAt:created_at,
         profiles!vendors_owner_id_profiles_id_fk!inner(ownerName:full_name),
         vendor_registrations(legalName:legal_name, neq, contactName:contact_name, contactPhone:contact_phone,
                              mapaqNumber:mapaq_number, submittedAt:submitted_at)`,
        { count: 'exact' }
      );
    if (query.status) q = q.eq('status', query.status);

    const { data, count, error } = await q
      // Oldest application first — a queue is worked from the front.
      .order('created_at', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);

    return {
      // Flattened back to the shape the joins produced, so the dashboard is
      // unaffected by the move.
      items: (data ?? []).map((r: any) => {
        const owner = one<any>(r.profiles);
        // The paperwork the CDC asks an administrator to actually read before
        // deciding. Owner-only under RLS; readable here because the admin has
        // its own policy (`0021`).
        const reg = one<any>(r.vendor_registrations);
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          vendorType: r.vendorType,
          city: r.city,
          addressStreet: r.addressStreet,
          addressPostalCode: r.addressPostalCode,
          status: r.status,
          statusReason: r.statusReason,
          reviewedAt: r.reviewedAt,
          createdAt: r.createdAt,
          ownerName: owner?.ownerName ?? null,
          legalName: reg?.legalName ?? null,
          neq: reg?.neq ?? null,
          contactName: reg?.contactName ?? null,
          contactPhone: reg?.contactPhone ?? null,
          mapaqNumber: reg?.mapaqNumber ?? null,
          submittedAt: reg?.submittedAt ?? null,
        };
      }),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * One merchant file, with everything a reviewer needs to decide it.
   *
   * `documents` folds the separate path columns into one array with a `kind`
   * discriminator — that is the shape a documents card renders.
   *
   * Each carries a signed URL into the **private** `merchant-documents`
   * bucket, valid for {@link DOCUMENT_URL_TTL_SECONDS}. Short on purpose: these
   * are identity papers and bank letters, and a URL pasted into a chat should
   * stop working before anyone else opens it. The page re-fetches to renew.
   */
  async vendorDetail(id: string): Promise<AdminVendorDetail> {
    // `profiles` twice — the owner, and whoever reviewed the file — which
    // PostgREST disambiguates by naming the foreign key rather than aliasing
    // the table.
    const fetched = await unwrap<any>(
      this.db
        .from('vendors')
        .select(
          `*,
           owner:profiles!vendors_owner_id_profiles_id_fk(fullName:full_name, avatarUrl:avatar_url, memberSince:member_since),
           reviewer:profiles!vendors_reviewed_by_profiles_id_fk(fullName:full_name),
           registration:vendor_registrations(*)`
        )
        .eq('id', id)
        .maybeSingle()
    );
    if (!fetched) throw new NotFoundException('Vendor not found');

    const row = camelize<any>(fetched);
    const owner = one<any>(row.owner);
    // Left, not inner: a pending file has no reviewer yet.
    const reviewer = one<any>(row.reviewer);
    // Left, not inner: `vendor_registrations` is 1:1-optional.
    const reg = one<any>(row.registration);

    const [ownerAuth, hours, sections, categoryRows, stats] = await Promise.all([
      // `auth.users` is reachable only through this one definer function now —
      // `service_role` holds no SELECT on it. See the migration.
      unwrap<{ id: string; email: string | null }[]>(
        this.db.rpc('admin_auth_users', { p_ids: [row.ownerId] })
      ),
      // `day` is 0 = Sunday, matching JS `Date.getDay()`.
      unwrap<any[]>(
        this.db.from('vendor_hours').select('day, open, close, closed').eq('vendor_id', id).order('day', { ascending: true })
      ),
      unwrap<any[]>(
        this.db
          .from('vendor_sections')
          .select('id, nameFr:name_fr, position')
          .eq('vendor_id', id)
          .order('position', { ascending: true })
          .order('name_fr', { ascending: true })
      ),
      unwrap<any[]>(
        this.db.from('vendor_categories').select('categories!inner(id, slug, nameFr:name_fr)').eq('vendor_id', id)
      ).then((rows) => rows.map((r: any) => one<any>(r.categories)).filter(Boolean)),
      unwrap<Record<string, any>>(this.db.rpc('admin_vendor_stats', { p_vendor_id: id })),
    ]);

    const base = {
      ...row,
      ownerName: owner?.fullName ?? null,
      ownerEmail: ownerAuth[0]?.email ?? null,
      ownerAvatarUrl: owner?.avatarUrl ?? null,
      ownerMemberSince: owner?.memberSince ?? null,
      reviewerId: row.reviewedBy,
      reviewerName: reviewer?.fullName ?? null,
      neq: reg?.neq ?? null,
      contactName: reg?.contactName ?? null,
      contactPhone: reg?.contactPhone ?? null,
      mapaqNumber: reg?.mapaqNumber ?? null,
      submittedAt: reg?.submittedAt ?? null,
      idDocumentPath: reg?.idDocumentPath ?? null,
      businessNumberDocumentPath: reg?.businessNumberDocumentPath ?? null,
      mapaqDocumentPath: reg?.mapaqDocumentPath ?? null,
    };

    type DocumentKind = 'id' | 'business_number' | 'mapaq' | 'bank';
    const documentPaths = [
      { kind: 'id' as const, path: reg?.idDocumentPath ?? null },
      { kind: 'business_number' as const, path: reg?.businessNumberDocumentPath ?? null },
      { kind: 'mapaq' as const, path: reg?.mapaqDocumentPath ?? null },
      { kind: 'bank' as const, path: reg?.bankDocumentPath ?? null },
    ].filter((d): d is { kind: DocumentKind; path: string } => d.path !== null);

    const signed = documentPaths.length
      ? await this.db.storage
          .from(MERCHANT_DOCUMENTS_BUCKET)
          .createSignedUrls(documentPaths.map((d) => d.path), DOCUMENT_URL_TTL_SECONDS)
      : { data: [], error: null };
    if (signed.error) this.logger.warn(`Could not sign documents for vendor ${id}: ${signed.error.message}`);
    // A file that fails to sign still appears, with no URL — the reviewer
    // should see that a document was submitted and cannot be opened, not that
    // none was submitted.
    const documents = documentPaths.map((d) => ({
      ...d,
      url: signed.data?.find((s) => s.path === d.path && !s.error)?.signedUrl ?? null,
    }));

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
      registration: reg
        ? {
            legalName: reg.legalName ?? null,
            neq: reg.neq ?? null,
            gstNumber: reg.gstNumber ?? null,
            qstNumber: reg.qstNumber ?? null,
            contactName: reg.contactName ?? '',
            contactPhone: reg.contactPhone ?? '',
            mapaqNumber: reg.mapaqNumber ?? null,
            mapaqExpiresOn: reg.mapaqExpiresOn ?? null,
            payoutMethod: reg.payoutMethod ?? null,
            submittedAt: reg.submittedAt ?? null,
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
    const vendor = await unwrap<{ id: string; status: ApplicationStatus; name: string } | null>(
      this.db.from('vendors').select('id, status, name').eq('id', vendorId).maybeSingle()
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    assertDecision(vendor.status, to);

    // The decision and its audit entry commit together or not at all — an
    // approval nobody is recorded as having made is the gap `admin_audit_log`
    // exists to close, and an entry for a decision that rolled back is worse.
    // `admin_decide_vendor` also re-checks the status it was given, so two
    // administrators working the same queue cannot both decide one file.
    const updated = await unwrapRpc<Record<string, unknown>>(
      this.db.rpc('admin_decide_vendor', {
        p_admin_id: adminId,
        p_vendor_id: vendorId,
        p_from: vendor.status,
        p_to: to,
        // Cast because the generated RPC types model every argument as
        // non-null. `status_reason` is nullable and an approval with no note
        // attached is a real state, not a missing value to invent one for.
        p_reason: (input.reason ?? null) as string,
        p_action: AUDIT_ACTION_FOR.vendor[to],
        p_label: vendor.name,
      }),
      (error) => {
        if (error.code === DECIDED_BY_SOMEONE_ELSE) throw new BadRequestException(error.message);
        throw unexpectedDbError(error);
      }
    );

    this.logger.log(`Admin ${adminId} moved vendor ${vendorId} ("${vendor.name}") from ${vendor.status} to ${to}`);
    if (to === 'approved') await this.notify.applicationApproved('vendor', vendorId);
    return camelize(updated);
  }

  // ── couriers ──────────────────────────────────────────────────────────────

  async listCouriers(query: ReviewQuery): Promise<Page<unknown>> {
    let q = this.db
      .from('couriers')
      .select(
        `id, fullName:full_name, phone, vehicle, plate, licenceNumber:licence_number, city,
         status, statusReason:status_reason, reviewedAt:reviewed_at, isOnline:is_online,
         deliveryCount:delivery_count, joinedAt:joined_at,
         courier_insurance(insurerName:insurer_name, policyNumber:policy_number, insuranceExpiry:expiry)`,
        { count: 'exact' }
      );
    if (query.status) q = q.eq('status', query.status);

    const { data, count, error } = await q
      .order('joined_at', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);

    return {
      items: (data ?? []).map((r: any) => {
        // Null for every bike courier by design — the card needs an empty
        // state, not a spinner.
        const ins = one<any>(r.courier_insurance);
        const { courier_insurance: _drop, ...rest } = r;
        return {
          ...rest,
          insurerName: ins?.insurerName ?? null,
          policyNumber: ins?.policyNumber ?? null,
          insuranceExpiry: ins?.insuranceExpiry ?? null,
        };
      }),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
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
    const fetched = await unwrap<any>(
      this.db
        .from('couriers')
        .select(
          `*,
           account:profiles!couriers_user_id_profiles_id_fk(fullName:full_name, avatarUrl:avatar_url, memberSince:member_since),
           reviewer:profiles!couriers_reviewed_by_profiles_id_fk(fullName:full_name),
           insurance:courier_insurance(*),
           payout:courier_payouts(*)`
        )
        .eq('id', id)
        .maybeSingle()
    );
    if (!fetched) throw new NotFoundException('Courier not found');

    const row = camelize<any>(fetched);
    const account = one<any>(row.account);
    const reviewer = one<any>(row.reviewer);
    const insurance = one<any>(row.insurance);
    // ⚠️ A **Stripe Connect account**, not bank details — this database holds
    // no raw bank details by design; Stripe collects them during onboarding.
    const payout = one<any>(row.payout);

    const [accountAuth, stats] = await Promise.all([
      unwrap<{ id: string; email: string | null }[]>(this.db.rpc('admin_auth_users', { p_ids: [row.userId] })),
      unwrap<Record<string, any>>(this.db.rpc('admin_courier_stats', { p_courier_id: id })),
    ]);

    const base = {
      ...row,
      accountName: account?.fullName ?? null,
      accountEmail: accountAuth[0]?.email ?? null,
      accountAvatarUrl: account?.avatarUrl ?? null,
      accountMemberSince: account?.memberSince ?? null,
      reviewerId: row.reviewedBy,
      reviewerName: reviewer?.fullName ?? null,
      insurerName: insurance?.insurerName ?? null,
      policyNumber: insurance?.policyNumber ?? null,
      insuranceExpiry: insurance?.expiry ?? null,
      stripeConnectAccountId: payout?.stripeConnectAccountId ?? null,
      payoutStatus: payout?.status ?? null,
      payoutUpdatedAt: payout?.updatedAt ?? null,
    };

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
    const courier = await unwrap<{ id: string; status: ApplicationStatus; fullName: string } | null>(
      this.db.from('couriers').select('id, status, fullName:full_name').eq('id', courierId).maybeSingle()
    );
    if (!courier) throw new NotFoundException('Courier not found');
    assertDecision(courier.status, to);

    // Same one-transaction guarantee as `decideVendor`. Losing approval also
    // takes them off shift in the same write — otherwise a suspended courier
    // stays in the dispatch pool until they happen to toggle it themselves,
    // which a suspended courier has no reason to do.
    const updated = await unwrapRpc<Record<string, unknown>>(
      this.db.rpc('admin_decide_courier', {
        p_admin_id: adminId,
        p_courier_id: courierId,
        p_from: courier.status,
        p_to: to,
        // Cast because the generated RPC types model every argument as
        // non-null. `status_reason` is nullable and an approval with no note
        // attached is a real state, not a missing value to invent one for.
        p_reason: (input.reason ?? null) as string,
        p_action: AUDIT_ACTION_FOR.courier[to],
        p_label: courier.fullName,
      }),
      (error) => {
        if (error.code === DECIDED_BY_SOMEONE_ELSE) throw new BadRequestException(error.message);
        throw unexpectedDbError(error);
      }
    );

    this.logger.log(`Admin ${adminId} moved courier ${courierId} ("${courier.fullName}") from ${courier.status} to ${to}`);
    if (to === 'approved') await this.notify.applicationApproved('courier', courierId);
    return camelize(updated);
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
    // An RPC because the filter and the count both span `auth.users`, which
    // `service_role` cannot read directly. `containsPattern` is not optional:
    // a bare `%${q}%` with `q = '%'` matches every row and hands over the whole
    // user table. See `common/sql/like.ts`.
    const page = await unwrap<{ items: unknown[]; total: number }>(
      this.db.rpc('admin_list_users', {
        p_role: query.role ?? undefined,
        p_pattern: query.search ? containsPattern(query.search) : undefined,
        p_limit: query.limit,
        p_offset: query.offset,
      })
    );
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
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
    // `profiles` twice — the account, and whoever referred them — named by
    // foreign key rather than aliased.
    const fetched = await unwrap<any>(
      this.db
        .from('profiles')
        .select(
          `id, fullName:full_name, avatarUrl:avatar_url, memberSince:member_since, role,
           vendorId:vendor_id, courierId:courier_id, referredById:referred_by,
           referrer:profiles!profiles_referred_by_profiles_id_fk(fullName:full_name)`
        )
        .eq('id', id)
        .maybeSingle()
    );
    if (!fetched) throw new NotFoundException('User not found');
    const base = camelize<any>(fetched);
    const referrer = one<any>(base.referrer);

    const [auth, linkedVendor, linkedCourier, addressRows, activity, recentOrders] = await Promise.all([
      unwrap<any[]>(this.db.rpc('admin_auth_users', { p_ids: [id] })),
      base.vendorId
        ? unwrap<any>(
            this.db
              .from('vendors')
              .select('id, name, slug, status, vendorType:vendor_type')
              .eq('id', base.vendorId)
              .maybeSingle()
          )
        : Promise.resolve(null),
      base.courierId
        ? unwrap<any>(
            this.db
              .from('couriers')
              .select('id, fullName:full_name, status, vehicle, isOnline:is_online')
              .eq('id', base.courierId)
              .maybeSingle()
          )
        : Promise.resolve(null),
      unwrap<any[]>(
        this.db
          .from('addresses')
          .select('id, label, street, city, postalCode:postal_code, lat, lng, isDefault:is_default')
          .eq('profile_id', id)
          .order('is_default', { ascending: false })
      ),
      unwrap<Record<string, any>>(this.db.rpc('admin_user_activity', { p_profile_id: id })),
      // Keeps cancellations, unlike the aggregates — "what happened lately"
      // should show an order that fell through.
      unwrap<any[]>(
        this.db
          .from('orders')
          .select('id, status, totalCad:total_cad, createdAt:created_at, vendors!inner(name)')
          .eq('customer_id', id)
          .order('created_at', { ascending: false })
          .limit(5)
      ),
    ]);

    const authRow = auth[0] ?? {};

    return {
      id: base.id,
      fullName: base.fullName,
      email: authRow.email ?? null,
      avatarUrl: base.avatarUrl,
      memberSince: base.memberSince,
      role: base.role,
      auth: {
        emailConfirmedAt: authRow.email_confirmed_at ?? null,
        lastSignInAt: authRow.last_sign_in_at ?? null,
        phone: authRow.phone ?? null,
        bannedUntil: authRow.banned_until ?? null,
      },
      vendor: linkedVendor ?? null,
      courier: linkedCourier ?? null,
      referredBy: base.referredById ? { id: base.referredById, fullName: referrer?.fullName ?? '—' } : null,
      referralCount: activity.referralCount ?? 0,
      addresses: addressRows,
      activity: {
        orderCount: activity.orderCount ?? 0,
        lifetimeSpendCad: activity.lifetimeSpendCad ?? 0,
        lastOrderAt: activity.lastOrderAt ?? null,
        recentOrders: recentOrders.map((o: any) => ({
          id: o.id,
          status: o.status,
          totalCad: num(o.totalCad),
          createdAt: o.createdAt,
          vendorName: one<any>(o.vendors)?.name ?? null,
        })),
      },
    } as AdminUserDetail;
  }
}

/** `admin_decide_vendor` / `admin_decide_courier` raise this when the status moved under the reviewer. */
const DECIDED_BY_SOMEONE_ELSE = 'SGB06';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
