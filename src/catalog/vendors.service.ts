import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { GeoService } from '../geo/geo.service.js';
import {
  categories,
  products,
  profiles,
  vendorCategories,
  vendorHours,
  vendorRegistrations,
  vendorSections,
  vendors,
} from '../db/schema/index.js';
import type { ApplyVendorInput, SectionInput, SetHoursInput, UpdateVendorInput, VendorQuery } from './dto/vendor.dto.js';
import type { Page } from './dto/query.dto.js';
import { containsPattern, escapeLikePattern } from '../common/sql/like.js';
import { assertMediaPath, VENDOR_MEDIA_BUCKET } from './media-paths.js';
import { toVendor, type VendorResponse, type VendorRow } from './mappers.js';
import { slugify, uniqueSlug } from './slugify.js';

/**
 * "Is this shop trading right now", asked of Postgres.
 *
 * Computed in SQL rather than in TypeScript so there is exactly one
 * implementation: the `?openNow=true` filter has to run in the database (a
 * filter applied after `LIMIT` would paginate over the wrong set — page 2 of
 * "open shops" would silently skip whatever page 1 discarded), and computing
 * the returned `isOpen` flag anywhere else would mean two versions of the same
 * rule, free to drift apart.
 *
 * Same comparison as `lib/shopHours.ts`'s `shopDay()` in the mobile app,
 * boundaries included: open-inclusive, close-exclusive. The timezone is
 * explicit because this process runs in UTC — a naive `now()` would call a shop
 * that closes at 21:00 shut from 16:00 local, every day. `extract(dow …)`
 * returns 0 for Sunday, which is what `vendor_hours.day` and the app's
 * `Date.getDay()` both mean.
 */
const IS_OPEN_NOW = sql<boolean>`exists (
  select 1 from ${vendorHours} h
  where h.vendor_id = ${vendors.id}
    and h.closed = false
    and h.day = extract(dow from (now() at time zone 'America/Montreal'))::int
    and (now() at time zone 'America/Montreal')::time >= h.open::time
    and (now() at time zone 'America/Montreal')::time < h.close::time
)`;

/** Every column the response needs, plus the computed flag — used by every read below. */
const vendorColumns = {
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
  ownerId: vendors.ownerId,
  status: vendors.status,
  isOpen: IS_OPEN_NOW,
};

/** Postgres's own code for "unique violation" — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = '23505';

/**
 * Whether an error is a unique violation on one named constraint. Checked by
 * name because a single statement can violate either of two, and they mean
 * different things to the caller.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint_name: constraintName } = error as { code?: unknown; constraint_name?: unknown };
  return code === UNIQUE_VIOLATION && constraintName === constraint;
}

/** Nine to nine, seven days. A starting point the merchant edits, not a claim. */
const DEFAULT_HOURS = Array.from({ length: 7 }, (_, day) => ({ day, open: '09:00', close: '21:00', closed: false }));

/**
 * Headings a new shop starts with, so its page is not a single unsorted list on
 * day one. They are the merchant's own words to change (CDC addendum v1.1,
 * §01) — a first draft, not a taxonomy.
 */
function defaultSectionNames(vendorType: 'grocery' | 'restaurant'): string[] {
  return vendorType === 'restaurant'
    ? ['Entrées', 'Plats', 'Desserts', 'Boissons']
    : ['Fruits & légumes', 'Épices', 'Conserves', 'Boissons'];
}

@Injectable()
export class VendorsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly geo: GeoService
  ) {}

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * Only shops an administrator has cleared.
   *
   * Every list a shopper browses goes through this. A shop whose file is still
   * in the queue is not "a shop that happens to be closed" — it is one the
   * platform has not vouched for, and putting it in front of someone who could
   * order from it is the thing the approval step exists to prevent.
   */
  async list(query: VendorQuery): Promise<Page<VendorResponse>> {
    const conditions: SQL[] = [eq(vendors.status, 'approved')];

    if (query.type) conditions.push(eq(vendors.vendorType, query.type));
    if (query.city) conditions.push(eq(vendors.city, query.city));
    if (query.categoryId) {
      // `exists` rather than a join: a join against a many-to-many would
      // duplicate a vendor row per matching category and break both the count
      // and the page size.
      conditions.push(
        sql`exists (select 1 from ${vendorCategories} vc where vc.vendor_id = ${vendors.id} and vc.category_id = ${query.categoryId})`
      );
    }
    if (query.q) {
      // Escaped: an unescaped `?q=%` would build the pattern `%%%` and return
      // every shop on the platform. See `common/sql/like.ts`.
      const term = containsPattern(query.q);
      conditions.push(or(ilike(vendors.name, term), ilike(vendors.specialtyFr, term))!);
    }
    if (query.openNow === true) conditions.push(IS_OPEN_NOW);
    if (query.openNow === false) conditions.push(sql`not ${IS_OPEN_NOW}`);

    const where = and(...conditions);

    const [rows, [counted]] = await Promise.all([
      this.db
        .select(vendorColumns)
        .from(vendors)
        .where(where)
        // `id` breaks ties, and it has to: `name` is not unique, and duplicate
        // shop names are an expected fact (`uniqueSlug` exists for exactly
        // that). Without a unique tiebreak Postgres may order tied rows
        // differently between the `offset=0` and `offset=20` queries, so page 2
        // can repeat a shop page 1 already showed and silently drop another.
        .orderBy(asc(vendors.name), asc(vendors.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(vendors).where(where),
    ]);

    return {
      items: await this.hydrate(rows),
      total: counted?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Public lookups are approved-only — a deliberate tightening over the mock,
   * whose `getVendorById` filtered nothing because the merchant's own pending
   * shop had to be reachable somehow. It now has its own route (`/vendors/me`),
   * so the public one no longer has to serve a shop the platform hasn't
   * vouched for to anyone who can guess a uuid.
   */
  async byId(id: string): Promise<VendorResponse> {
    return this.oneOrFail(and(eq(vendors.id, id), eq(vendors.status, 'approved'))!);
  }

  async bySlug(slug: string): Promise<VendorResponse> {
    return this.oneOrFail(and(eq(vendors.slug, slug), eq(vendors.status, 'approved'))!);
  }

  /** The merchant's own shop, at any status — how a pending applicant watches their own queue position. */
  async mine(userId: string): Promise<VendorResponse> {
    return this.oneOrFail(eq(vendors.ownerId, userId));
  }

  private async oneOrFail(where: SQL): Promise<VendorResponse> {
    const [row] = await this.db.select(vendorColumns).from(vendors).where(where).limit(1);
    if (!row) throw new NotFoundException('Vendor not found');
    const [hydrated] = await this.hydrate([row]);
    return hydrated;
  }

  /**
   * Categories, hours and sections for a whole page in three queries, not three
   * per row. The mock could hold the entire catalogue in memory and reach into
   * it; a real list endpoint that did the same thing per vendor would issue
   * 61 queries to render 20 shops.
   */
  private async hydrate(rows: VendorRow[]): Promise<VendorResponse[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [categoryLinks, hours, sections] = await Promise.all([
      this.db
        .select({ vendorId: vendorCategories.vendorId, categoryId: vendorCategories.categoryId })
        .from(vendorCategories)
        .where(inArray(vendorCategories.vendorId, ids)),
      this.db
        .select({
          vendorId: vendorHours.vendorId,
          day: vendorHours.day,
          open: vendorHours.open,
          close: vendorHours.close,
          closed: vendorHours.closed,
        })
        .from(vendorHours)
        .where(inArray(vendorHours.vendorId, ids))
        .orderBy(asc(vendorHours.day)),
      this.db
        .select({
          vendorId: vendorSections.vendorId,
          id: vendorSections.id,
          nameFr: vendorSections.nameFr,
          position: vendorSections.position,
        })
        .from(vendorSections)
        .where(inArray(vendorSections.vendorId, ids))
        .orderBy(asc(vendorSections.position), asc(vendorSections.nameFr)),
    ]);

    const byVendor = <T extends { vendorId: string }>(items: T[]) => {
      const map = new Map<string, T[]>();
      for (const item of items) {
        const list = map.get(item.vendorId);
        if (list) list.push(item);
        else map.set(item.vendorId, [item]);
      }
      return map;
    };

    const categoriesByVendor = byVendor(categoryLinks);
    const hoursByVendor = byVendor(hours);
    const sectionsByVendor = byVendor(sections);

    return rows.map((row) =>
      toVendor(row, {
        categoryIds: (categoriesByVendor.get(row.id) ?? []).map((c) => c.categoryId),
        hours: (hoursByVendor.get(row.id) ?? []).map(({ day, open, close, closed }) => ({ day, open, close, closed })),
        sections: (sectionsByVendor.get(row.id) ?? []).map(({ id, nameFr, position }) => ({ id, nameFr, position })),
      })
    );
  }

  /** The two verticals the catalogue is organised around, with live counts. Boulangerie is out of v1 scope (CDC addendum §01). */
  async verticals() {
    const counts = await this.db
      .select({ vendorType: vendors.vendorType, total: sql<number>`count(*)::int` })
      .from(vendors)
      .where(eq(vendors.status, 'approved'))
      .groupBy(vendors.vendorType);

    const totalFor = (type: 'grocery' | 'restaurant') => counts.find((c) => c.vendorType === type)?.total ?? 0;

    return [
      { vendorType: 'grocery' as const, labelFr: 'Épicerie', vendorCount: totalFor('grocery') },
      { vendorType: 'restaurant' as const, labelFr: 'Restaurant', vendorCount: totalFor('restaurant') },
    ];
  }

  // ── registration ──────────────────────────────────────────────────────────

  /**
   * A merchant registers their shop.
   *
   * Created `pending` and kept out of every customer-facing list until an
   * administrator clears it (Phase 8's endpoints are what do the clearing).
   * Rating and review count start at zero rather than at a flattering default —
   * a shop that has never sold anything has no reputation, and inventing one is
   * the kind of lie a marketplace cannot walk back.
   *
   * `categoryIds` starts empty on purpose: which platform categories a shop
   * belongs to falls out of what it actually stocks, so it fills in as the
   * catalogue does rather than being claimed up front.
   *
   * Note for the open question in docs/BACKEND-BUILD-PHASES.md ("Confirm before
   * Phase 0" #2): the CDC's base spec sends merchants to the admin website to
   * register, while the mobile app already built this in-app. This endpoint
   * serves both — it is a plain authenticated POST, callable from the app today
   * and from the admin web app if that flow moves there — so the decision does
   * not have to be made before the rest of Phase 2 can land.
   */
  async apply(userId: string, input: ApplyVendorInput): Promise<VendorResponse> {
    // A fast, friendly refusal for the ordinary case. It is *not* the guarantee
    // — this read and the insert below are separate statements, so two taps a
    // moment apart both pass here. `vendors_owner_id_unique` is what actually
    // holds the rule, and the catch below turns its violation into this same
    // message.
    const [existing] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (existing) throw new ConflictException('This account already has a shop');

    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);

    const created = await this.db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      // Only the slugs that could actually collide, rather than every slug on
      // the platform: `uniqueSlug` appends `-2`, `-3`, … to this exact base, so
      // nothing outside the prefix can be in its way.
      const base = slugify(input.name) || id;
      const taken = await tx
        .select({ slug: vendors.slug })
        .from(vendors)
        .where(like(vendors.slug, `${escapeLikePattern(base)}%`));
      const slug = uniqueSlug(input.name, new Set(taken.map((t) => t.slug)), id);

      const [vendor] = await tx
        .insert(vendors)
        .values({
          id,
          slug,
          name: input.name,
          vendorType: input.vendorType,
          specialtyFr: input.specialtyFr,
          logoUrl: '',
          coverUrl: '',
          city: input.city,
          // The mock seeds `neighborhood` from the city until the merchant
          // says otherwise — there is no neighbourhood field on the form.
          neighborhood: input.city,
          addressStreet: input.street,
          addressPostalCode: input.postalCode,
          addressLat: lat,
          addressLng: lng,
          deliveryEtaMin: input.deliveryEtaMin,
          isHalalCertified: input.isHalalCertified,
          ownerId: userId,
          status: 'pending',
        })
        .returning({ id: vendors.id });

      await tx.insert(vendorRegistrations).values({
        vendorId: vendor.id,
        neq: input.neq,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        mapaqNumber: input.mapaqNumber ?? null,
      });

      await tx.insert(vendorHours).values(DEFAULT_HOURS.map((h) => ({ ...h, vendorId: vendor.id })));
      await tx.insert(vendorSections).values(
        defaultSectionNames(input.vendorType).map((nameFr, position) => ({ vendorId: vendor.id, nameFr, position }))
      );

      // The profile now points at the shop, so `GET /me` alone tells the app
      // which merchant it is signed in as — matching the mock's `User.vendorId`.
      await tx.update(profiles).set({ vendorId: vendor.id, updatedAt: new Date() }).where(eq(profiles.id, userId));

      return vendor.id;
    }).catch((error: unknown) => {
      // Both of this transaction's races land here as a `23505`, and they need
      // different answers. Distinguished by constraint name rather than by
      // re-querying, which would race all over again.
      if (isUniqueViolation(error, 'vendors_owner_id_unique')) {
        throw new ConflictException('This account already has a shop');
      }
      if (isUniqueViolation(error, 'vendors_slug_unique')) {
        // Two shops with the same name registering in the same instant: both
        // read the slug list before either wrote, so both computed the same
        // free slug. Rare enough to answer with "try again" rather than to
        // serialise every registration behind a lock.
        throw new ConflictException('That shop name was just taken — please submit again');
      }
      throw error;
    });

    return this.oneOrFail(eq(vendors.id, created));
  }

  // ── merchant self-service ─────────────────────────────────────────────────

  /** The ownership check every mutation below reuses. */
  private async ownedVendorId(userId: string): Promise<string> {
    const [row] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  async update(userId: string, patch: UpdateVendorInput): Promise<VendorResponse> {
    const vendorId = await this.ownedVendorId(userId);

    if (patch.logoUrl !== undefined) assertMediaPath(patch.logoUrl, VENDOR_MEDIA_BUCKET, vendorId, 'logoUrl');
    if (patch.coverUrl !== undefined) assertMediaPath(patch.coverUrl, VENDOR_MEDIA_BUCKET, vendorId, 'coverUrl');

    if (patch.categoryIds) {
      const known = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(inArray(categories.id, patch.categoryIds));
      if (known.length !== new Set(patch.categoryIds).size) {
        throw new NotFoundException('One or more categories do not exist');
      }
    }

    await this.db.transaction(async (tx) => {
      const { categoryIds, ...columns } = patch;
      if (Object.keys(columns).length > 0) {
        await tx.update(vendors).set({ ...columns, updatedAt: new Date() }).where(eq(vendors.id, vendorId));
      }
      if (categoryIds) {
        await tx.delete(vendorCategories).where(eq(vendorCategories.vendorId, vendorId));
        if (categoryIds.length > 0) {
          await tx
            .insert(vendorCategories)
            .values([...new Set(categoryIds)].map((categoryId) => ({ vendorId, categoryId })));
        }
      }
    });

    return this.oneOrFail(eq(vendors.id, vendorId));
  }

  async setHours(userId: string, week: SetHoursInput): Promise<VendorResponse> {
    const vendorId = await this.ownedVendorId(userId);
    await this.db.transaction(async (tx) => {
      await tx.delete(vendorHours).where(eq(vendorHours.vendorId, vendorId));
      await tx.insert(vendorHours).values(week.map((h) => ({ ...h, vendorId })));
    });
    return this.oneOrFail(eq(vendors.id, vendorId));
  }

  async addSection(userId: string, input: SectionInput) {
    const vendorId = await this.ownedVendorId(userId);
    const [{ next }] = await this.db
      .select({ next: sql<number>`coalesce(max(${vendorSections.position}), -1) + 1` })
      .from(vendorSections)
      .where(eq(vendorSections.vendorId, vendorId));
    const [created] = await this.db
      .insert(vendorSections)
      .values({ vendorId, nameFr: input.nameFr, position: input.position ?? next })
      .returning({ id: vendorSections.id, nameFr: vendorSections.nameFr, position: vendorSections.position });
    return created;
  }

  async updateSection(userId: string, sectionId: string, input: SectionInput) {
    const vendorId = await this.ownedVendorId(userId);
    const [updated] = await this.db
      .update(vendorSections)
      .set({ nameFr: input.nameFr, ...(input.position !== undefined ? { position: input.position } : {}) })
      .where(and(eq(vendorSections.id, sectionId), eq(vendorSections.vendorId, vendorId)))
      .returning({ id: vendorSections.id, nameFr: vendorSections.nameFr, position: vendorSections.position });
    if (!updated) throw new NotFoundException('Section not found');
    return updated;
  }

  /**
   * A section holding products cannot be deleted — `products.section_id` is
   * `NOT NULL`, so the row has nowhere to go. Refused with an explanation
   * rather than letting the FK raise a 500 the merchant can't act on.
   */
  async removeSection(userId: string, sectionId: string): Promise<void> {
    const vendorId = await this.ownedVendorId(userId);

    // Ownership is resolved *before* the product count, and the count is scoped
    // to this vendor. Counting first leaked across tenants: section ids are
    // published on every public vendor response, so passing another shop's
    // section id returned either "still holds 12 product(s)" or a 404 —
    // enumerating a competitor's per-section inventory without deleting a thing.
    const [section] = await this.db
      .select({ id: vendorSections.id })
      .from(vendorSections)
      .where(and(eq(vendorSections.id, sectionId), eq(vendorSections.vendorId, vendorId)))
      .limit(1);
    if (!section) throw new NotFoundException('Section not found');

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.sectionId, sectionId), eq(products.vendorId, vendorId)));
    if (total > 0) {
      throw new ForbiddenException(`This section still holds ${total} product(s) — move or delete them first`);
    }

    await this.db
      .delete(vendorSections)
      .where(and(eq(vendorSections.id, sectionId), eq(vendorSections.vendorId, vendorId)));
  }
}
