import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { snakeize } from '../db/case.js';
import { unwrap, unwrapRpc, unwrapVoid } from '../db/unwrap.js';
import { GeoService } from '../geo/geo.service.js';
import {
  REGISTRATION_DOCUMENT_TYPES,
  type ApplyVendorInput,
  type DocumentUploadInput,
  type SectionInput,
  type SetHoursInput,
  type UpdateVendorInput,
  type VendorQuery,
} from './dto/vendor.dto.js';
import type { Page } from './dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import { orIlike } from '../common/sql/postgrest.js';
import { assertMediaPath, MERCHANT_DOCUMENTS_BUCKET, VENDOR_MEDIA_BUCKET } from './media-paths.js';
import { toVendor, type VendorResponse, type VendorRow } from './mappers.js';
import { slugify } from './slugify.js';
import { SpecialtiesService } from './specialties.controller.js';

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
/**
 * Every column the response needs, plus the computed flag — used by every read
 * below.
 *
 * `isOpen` is a PostgREST **computed column**: `public.is_open(vendors)` is a
 * function taking the row type, which PostgREST exposes as a virtual column
 * that can be both selected and *filtered on*. The filter has to run in the
 * database — one applied after LIMIT would paginate over the wrong set, so
 * page 2 of "open shops" would silently skip whatever page 1 discarded — and
 * computing the returned flag anywhere else would mean two versions of one rule
 * free to drift. See the `vendors_is_open_computed_column` migration for the
 * timezone and boundary reasoning.
 */
const VENDOR_COLUMNS = `id, slug, name, vendorType:vendor_type, specialtyFr:specialty_fr,
  logoUrl:logo_url, coverUrl:cover_url, city, neighborhood,
  addressStreet:address_street, addressPostalCode:address_postal_code,
  addressLat:address_lat, addressLng:address_lng,
  rating, reviewCount:review_count, deliveryEtaMin:delivery_eta_min,
  isHalalCertified:is_halal_certified, ownerId:owner_id, status, isOpen:is_open`;

/** Postgres's own code for "unique violation" — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = '23505';

/**
 * Whether an error is a unique violation on one named constraint. Checked by
 * name because a single statement can violate either of two, and they mean
 * different things to the caller.
 *
 * PostgREST reports the constraint in `message`/`details` rather than in a
 * `constraint_name` field the way postgres.js did, so the name is matched
 * against both.
 */
function isUniqueViolation(error: PostgrestError | null, constraint: string): boolean {
  if (!error || error.code !== UNIQUE_VIOLATION) return false;
  return `${error.message} ${error.details ?? ''}`.includes(constraint);
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
    private readonly geo: GeoService,
    private readonly specialties: SpecialtiesService
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
    let q = this.db.from('vendors').select(VENDOR_COLUMNS, { count: 'exact' }).eq('status', 'approved');

    if (query.type) q = q.eq('vendor_type', query.type);
    if (query.city) q = q.eq('city', query.city);
    if (query.categoryId) {
      // `!inner` on the junction rather than an embed left alone: with a single
      // category id at most one junction row can match per vendor, so this
      // filters without the fan-out a many-to-many join would cause — verified
      // against the live data (row count == vendor count).
      q = this.db
        .from('vendors')
        .select(`${VENDOR_COLUMNS}, vendor_categories!inner(category_id)`, { count: 'exact' })
        .eq('status', 'approved')
        .eq('vendor_categories.category_id', query.categoryId);
      if (query.type) q = q.eq('vendor_type', query.type);
      if (query.city) q = q.eq('city', query.city);
    }
    if (query.q) {
      // Escaped twice, for two different grammars: `containsPattern` neutralises
      // the LIKE metacharacters, `orIlike` quotes the value so a comma in the
      // search term cannot split PostgREST's own filter syntax.
      q = q.or(orIlike(['name', 'specialty_fr'], containsPattern(query.q)));
    }
    // Cast: `is_open` is a PostgREST computed column, so it does not appear in
    // the generated column union — the generator only sees real columns. The
    // filter is valid and is exercised by the live check in verify-catalog.
    if (query.openNow !== undefined) q = (q as any).eq('is_open', query.openNow);

    const { data, count, error } = await q
      // `id` breaks ties, and it has to: `name` is not unique, and duplicate
      // shop names are an expected fact (`uniqueSlug` exists for exactly
      // that). Without a unique tiebreak Postgres may order tied rows
      // differently between the `offset=0` and `offset=20` queries, so page 2
      // can repeat a shop page 1 already showed and silently drop another.
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);

    return {
      items: await this.hydrate((data ?? []) as unknown as VendorRow[]),
      total: count ?? 0,
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
    return this.oneOrFail((q) => q.eq('id', id).eq('status', 'approved'));
  }

  async bySlug(slug: string): Promise<VendorResponse> {
    return this.oneOrFail((q) => q.eq('slug', slug).eq('status', 'approved'));
  }

  /** The merchant's own shop, at any status — how a pending applicant watches their own queue position. */
  async mine(userId: string): Promise<VendorResponse> {
    return this.oneOrFail((q) => q.eq('owner_id', userId));
  }

  private async oneOrFail(scope: (q: any) => any): Promise<VendorResponse> {
    const row = await unwrap<VendorRow | null>(
      scope(this.db.from('vendors').select(VENDOR_COLUMNS)).maybeSingle()
    );
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
      unwrap<{ vendorId: string; categoryId: string }[]>(
        this.db.from('vendor_categories').select('vendorId:vendor_id, categoryId:category_id').in('vendor_id', ids)
      ),
      unwrap<{ vendorId: string; day: number; open: string; close: string; closed: boolean }[]>(
        this.db
          .from('vendor_hours')
          .select('vendorId:vendor_id, day, open, close, closed')
          .in('vendor_id', ids)
          .order('day', { ascending: true })
      ),
      unwrap<{ vendorId: string; id: string; nameFr: string; position: number }[]>(
        this.db
          .from('vendor_sections')
          .select('vendorId:vendor_id, id, nameFr:name_fr, position')
          .in('vendor_id', ids)
          .order('position', { ascending: true })
          .order('name_fr', { ascending: true })
      ),
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
    // A `count` per vertical rather than one GROUP BY. There are exactly two
    // of them (CDC addendum §01 — boulangerie is out of v1 scope), and both are
    // named below anyway to backfill a zero, so a group-by bought nothing but
    // an RPC.
    const countOf = async (type: 'grocery' | 'restaurant') => {
      const { count, error } = await this.db
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('vendor_type', type);
      if (error) throw unexpectedDbError(error);
      return count ?? 0;
    };
    const [grocery, restaurant] = await Promise.all([countOf('grocery'), countOf('restaurant')]);

    return [
      { vendorType: 'grocery' as const, labelFr: 'Épicerie', vendorCount: grocery },
      { vendorType: 'restaurant' as const, labelFr: 'Restaurant', vendorCount: restaurant },
    ];
  }

  // ── registration ──────────────────────────────────────────────────────────

  /**
   * Somewhere to upload one registration document, before the shop exists.
   *
   * The shop's id does not exist until `apply` commits, so documents go under
   * the *owner's* id instead: `applications/<userId>/<kind>-<uuid>.<ext>`. The
   * API picks the whole path — the client never names a file — and hands back a
   * one-shot signed upload URL for exactly that path. Merchants hold no Storage
   * policy on this bucket at all (see migration `0030`), so this URL is the only
   * way a file gets in, and nothing a merchant holds can overwrite or delete a
   * document after an administrator has read it.
   *
   * `vendor_apply` then refuses any path outside this owner's folder or with no
   * object behind it, in the same transaction as the insert.
   *
   * ⚠️ A merchant who uploads and never submits leaves files behind. Bounded by
   * the rate limiter, but nothing purges them yet.
   */
  async createDocumentUpload(userId: string, input: DocumentUploadInput) {
    const existing = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (existing) throw new ConflictException('This account already has a shop');

    const ext = REGISTRATION_DOCUMENT_TYPES[input.contentType];
    const path = `applications/${userId}/${input.kind}-${randomUUID()}.${ext}`;
    const { data, error } = await this.db.storage.from(MERCHANT_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new InternalServerErrorException('Could not prepare the upload');
    return { path, uploadUrl: data.signedUrl, contentType: input.contentType };
  }

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
    // holds the rule, and the branch below turns its violation into this same
    // message.
    const existing = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (existing) throw new ConflictException('This account already has a shop');

    // Resolved before anything is written: an id from the other vendor type's
    // list, or one the back office has since retired, is refused here rather
    // than leaving a shop whose line under its name nobody chose.
    const specialty = await this.specialties.findActive(input.specialtyId, input.vendorType);
    if (!specialty) throw new BadRequestException('Choisissez une spécialité dans la liste');

    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);

    // Shop, paperwork, a default week of hours, starting sections and the
    // owner's profile pointer — together or not at all. A merchant left with a
    // shop row and no hours has a shop that is closed forever with no way to
    // say otherwise. The slug is chosen inside the same transaction; see the
    // `rpc_vendor_apply_update_hours` migration.
    const created = await unwrapRpc<string>(
      this.db.rpc('vendor_apply', {
        p_owner_id: userId,
        p_slug_base: slugify(input.name),
        p_name: input.name,
        p_vendor_type: input.vendorType,
        p_specialty_fr: specialty.nameFr,
        p_city: input.city,
        p_street: input.street,
        p_postal_code: input.postalCode,
        p_lat: lat,
        p_lng: lng,
        p_delivery_eta_min: input.deliveryEtaMin,
        p_is_halal_certified: input.isHalalCertified,
        p_legal_name: input.legalName,
        p_neq: (input.neq ?? null) as string,
        p_gst_number: input.gstNumber,
        p_qst_number: input.qstNumber,
        p_contact_name: input.contactName,
        p_contact_phone: input.contactPhone,
        p_mapaq_number: input.mapaqNumber,
        p_mapaq_expires_on: input.mapaqExpiresOn,
        p_payout_method: input.payoutMethod,
        p_id_document_path: input.idDocumentPath,
        p_business_number_document_path: (input.businessNumberDocumentPath ?? null) as string,
        p_mapaq_document_path: input.mapaqDocumentPath,
        // Only kept when it is how the merchant is paid — a bank letter
        // attached and then un-chosen is not a file the platform should hold.
        p_bank_document_path: (input.payoutMethod === 'bank_document' ? input.bankDocumentPath : null) as string,
        p_default_hours: DEFAULT_HOURS,
        p_default_sections: defaultSectionNames(input.vendorType),
      }),
      (error) => {
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
        // `vendor_apply`'s own check: a document path outside this owner's
        // folder, or with nothing uploaded behind it.
        if (error.code === '22023' && error.message.startsWith('document_not_found:')) {
          throw new BadRequestException('Un document joint est introuvable — ajoutez-le de nouveau');
        }
        throw unexpectedDbError(error);
      }
    );

    // Outside `vendor_apply`'s transaction, deliberately: the link is
    // bookkeeping for the back office, and the shop is complete without it —
    // `specialty_fr` above already carries the chosen line.
    await unwrapVoid(this.db.from('vendors').update({ specialty_id: specialty.id }).eq('id', created));

    return this.oneOrFail((q) => q.eq('id', created));
  }

  // ── merchant self-service ─────────────────────────────────────────────────

  /** The ownership check every mutation below reuses. */
  private async ownedVendorId(userId: string): Promise<string> {
    const row = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  async update(userId: string, patch: UpdateVendorInput): Promise<VendorResponse> {
    const vendorId = await this.ownedVendorId(userId);

    if (patch.logoUrl !== undefined) assertMediaPath(patch.logoUrl, VENDOR_MEDIA_BUCKET, vendorId, 'logoUrl');
    if (patch.coverUrl !== undefined) assertMediaPath(patch.coverUrl, VENDOR_MEDIA_BUCKET, vendorId, 'coverUrl');

    if (patch.categoryIds) {
      const known = await unwrap<{ id: string }[]>(
        this.db.from('categories').select('id').in('id', patch.categoryIds)
      );
      if (known.length !== new Set(patch.categoryIds).size) {
        throw new NotFoundException('One or more categories do not exist');
      }
    }

    const { categoryIds, ...columns } = patch;
    if (Object.keys(columns).length > 0) {
      await unwrap(
        this.db
          .from('vendors')
          .update({ ...snakeize(columns), updated_at: new Date().toISOString() })
          .eq('id', vendorId)
      );
    }
    if (categoryIds) {
      // Delete-then-insert, in one transaction: a half-applied set is a shop
      // that has silently left a vertical.
      await unwrapRpc<void>(
        this.db.rpc('vendor_set_categories', { p_vendor_id: vendorId, p_category_ids: [...new Set(categoryIds)] })
      );
    }

    return this.oneOrFail((q) => q.eq('id', vendorId));
  }

  async setHours(userId: string, week: SetHoursInput): Promise<VendorResponse> {
    const vendorId = await this.ownedVendorId(userId);
    // Must not be two requests: between the delete and the insert the shop has
    // no hours at all, which `is_open` reads as closed.
    await unwrapRpc<void>(this.db.rpc('vendor_set_hours', { p_vendor_id: vendorId, p_week: week }));
    return this.oneOrFail((q) => q.eq('id', vendorId));
  }

  async addSection(userId: string, input: SectionInput) {
    const vendorId = await this.ownedVendorId(userId);
    // `max(position) + 1` becomes "read the highest, add one" — one extra round
    // trip, and only when the caller did not name a position.
    let position = input.position;
    if (position === undefined) {
      const last = await unwrap<{ position: number } | null>(
        this.db
          .from('vendor_sections')
          .select('position')
          .eq('vendor_id', vendorId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
      );
      position = (last?.position ?? -1) + 1;
    }
    return unwrap<{ id: string; nameFr: string; position: number }>(
      this.db
        .from('vendor_sections')
        .insert({ vendor_id: vendorId, name_fr: input.nameFr, position })
        .select('id, nameFr:name_fr, position')
        .single()
    );
  }

  async updateSection(userId: string, sectionId: string, input: SectionInput) {
    const vendorId = await this.ownedVendorId(userId);
    const updated = await unwrap<{ id: string; nameFr: string; position: number } | null>(
      this.db
        .from('vendor_sections')
        .update({ name_fr: input.nameFr, ...(input.position !== undefined ? { position: input.position } : {}) })
        .eq('id', sectionId)
        .eq('vendor_id', vendorId)
        .select('id, nameFr:name_fr, position')
        .maybeSingle()
    );
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
    const section = await unwrap<{ id: string } | null>(
      this.db.from('vendor_sections').select('id').eq('id', sectionId).eq('vendor_id', vendorId).maybeSingle()
    );
    if (!section) throw new NotFoundException('Section not found');

    const { count, error } = await this.db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', sectionId)
      .eq('vendor_id', vendorId);
    if (error) throw unexpectedDbError(error);
    const total = count ?? 0;
    if (total > 0) {
      throw new ForbiddenException(`This section still holds ${total} product(s) — move or delete them first`);
    }

    await unwrap(this.db.from('vendor_sections').delete().eq('id', sectionId).eq('vendor_id', vendorId));
  }
}

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
