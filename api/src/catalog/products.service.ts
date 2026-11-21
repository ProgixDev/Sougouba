import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import {
  PRICE_BANDS,
  type CreateProductInput,
  type ProductListQuery,
  type ProductQuery,
  type ProductSearchQuery,
  type UpdateProductInput,
} from './dto/product.dto.js';
import type { Page } from './dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import { assertMediaPath, createMediaUpload, PRODUCT_MEDIA_BUCKET, type MediaImageUploadInput } from './media-paths.js';
import { toProduct, type ProductResponse, type ProductRow } from './mappers.js';

const PRODUCT_COLUMNS = `id, vendorId:vendor_id, categoryId:category_id, sectionId:section_id,
  name, description, priceCad:price_cad, compareAtPriceCad:compare_at_price_cad,
  imageUrl:image_url, stockQty:stock_qty, isAvailable:is_available, tags,
  nutritionCalories:nutrition_calories, nutritionProteinG:nutrition_protein_g,
  nutritionFatG:nutrition_fat_g, nutritionWeightG:nutrition_weight_g,
  hiddenAt:hidden_at, hiddenReason:hidden_reason`;

/** PostgREST's "no such function" and Postgres's own — `0037` not applied yet. */
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

/** The window the home screen ranks over: what is selling now, not since launch. */
const BEST_SELLER_DAYS = 30;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private warnedMissingBestSellers = false;

  constructor(@Inject(DB) private readonly db: Db) {}

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * The platform's best sellers, most units first — ids only; the home screen
   * already holds the products.
   *
   * Answers `[]` while `product_best_sellers` does not exist (migration `0037`
   * not applied): the home screen treats an empty list as "nothing ranked yet"
   * and fills the rail with deals, so the screen stays whole. Any other error
   * still throws.
   */
  async bestSellerIds(limit: number): Promise<string[]> {
    const { data, error } = await this.db.rpc('product_best_sellers', { p_limit: limit, p_days: BEST_SELLER_DAYS });
    if (error) {
      if (MISSING_FUNCTION.has(error.code)) {
        if (!this.warnedMissingBestSellers) {
          this.warnedMissingBestSellers = true;
          this.logger.warn('product_best_sellers does not exist yet — apply drizzle/0037_product_best_sellers.sql');
        }
        return [];
      }
      return unwrap<string[]>(Promise.resolve({ data: null, error }));
    }
    return (data ?? []).map((row) => row.product_id);
  }

  /**
   * `lib/productFilters.ts`'s `applyFilters`, moved into the database.
   *
   * The mobile version narrows and sorts an array the phone already holds;
   * every rule it applies is reproduced here as a `WHERE`/`ORDER BY` so the
   * phone can stop holding the array at all. The band comparisons keep their
   * asymmetry (`>= min`, `< max`) for the reason `PRICE_BANDS` documents.
   */
  /**
   * `lib/productFilters.ts`'s `applyFilters`, answered by `product_page`.
   *
   * An RPC rather than a PostgREST query because three of its rules have no
   * REST equivalent — the tag search (`unnest` + ilike), the `fr-CA` collation
   * on the name sort, and the price bands' deliberate asymmetry — and applying
   * any of them after the fact would paginate over the wrong set. See the
   * `rpc_product_page` migration.
   */
  private async page(
    scope: { vendorId?: string; approvedOnly: boolean },
    query: ProductQuery
  ): Promise<Page<ProductResponse>> {
    const [min, max] = PRICE_BANDS[query.priceBand];
    const result = await unwrap<{ items: ProductRow[]; total: number }>(
      this.db.rpc('product_page', {
        p_vendor_id: scope.vendorId,
        p_approved_only: scope.approvedOnly,
        // Escaped: unescaped, `?q=%` builds the pattern `%%%` and returns the
        // whole catalogue — the opposite of the literal `name.includes(q)` this
        // ports. See `common/sql/like.ts`.
        p_q: query.q ? containsPattern(query.q) : undefined,
        p_section_id: query.sectionId,
        p_category_id: query.categoryId,
        p_price_min: min ?? undefined,
        p_price_max: max ?? undefined,
        p_on_sale: query.onSale ?? false,
        p_in_stock_only: query.inStockOnly ?? false,
        p_sort: query.sort,
        p_limit: query.limit,
        p_offset: query.offset,
      })
    );

    return {
      items: (result.items ?? []).map((r) => toProduct(r)),
      total: result.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /** A shopper's view of one shop's shelves — approved shops only, same rule as the vendor list. */
  async listForVendor(vendorId: string, query: ProductQuery): Promise<Page<ProductResponse>> {
    await this.assertApprovedVendor(vendorId);
    return this.page({ vendorId, approvedOnly: true }, query);
  }

  /** Platform-wide search across every approved shop. */
  async search(query: ProductSearchQuery): Promise<Page<ProductResponse>> {
    return this.page({ vendorId: query.vendorId, approvedOnly: true }, query);
  }

  /**
   * The catalogue, platform-wide, with no search term — the browse to
   * `search`'s search. One `product_page` call, however many shops exist.
   *
   * This is what the home screen and a category tap need. They used to ask for
   * the shop list and then for each shop's shelf separately, which is 1 + N
   * requests for one screen and degrades as merchants sign up; the filtering
   * and paging were already in `page`, only a route that didn't demand `q` was
   * missing.
   */
  async list(query: ProductListQuery): Promise<Page<ProductResponse>> {
    return this.page({ vendorId: query.vendorId, approvedOnly: true }, query);
  }

  /**
   * Resolve a known set of ids in one round trip.
   *
   * Not `product_page`: the RPC has no id filter, and adding one would mean a
   * migration for a lookup that needs no sorting, paging or price bands. A
   * plain `in` is both the whole query and one statement.
   *
   * `vendors!inner(status)` applies the same approved-shops rule as `byId` —
   * see there for why the embed is inner. Ids that are unknown, or whose shop
   * is not approved, are **absent from the result rather than an error**: a
   * favourite whose shop got suspended should quietly drop off the list, and a
   * cart line pointing at a withdrawn product should fail at checkout with a
   * price the server recomputed, not here with a 404 for the whole screen.
   */
  async byIds(ids: string[]): Promise<ProductResponse[]> {
    const rows = await unwrap<ProductRow[]>(
      this.db
        .from('products')
        .select(`${PRODUCT_COLUMNS}, vendors!inner(status)`)
        .in('id', ids)
        .eq('vendors.status', 'approved')
        // Hidden by the back office: gone from the shopper's cart too.
        .is('hidden_at', null)
    );
    return rows.map((row) => toProduct(row));
  }

  async byId(id: string): Promise<ProductResponse> {
    // `vendors!inner(status)` with the filter on the embed is the `exists`
    // clause this replaces: an inner embed drops the product when its shop is
    // not approved, rather than returning it with a null shop.
    const row = await unwrap<ProductRow | null>(
      this.db
        .from('products')
        .select(`${PRODUCT_COLUMNS}, vendors!inner(status)`)
        .eq('id', id)
        .eq('vendors.status', 'approved')
        .is('hidden_at', null)
        .maybeSingle()
    );
    if (!row) throw new NotFoundException('Product not found');
    return toProduct(row);
  }

  private async assertApprovedVendor(vendorId: string): Promise<void> {
    const vendor = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('id', vendorId).eq('status', 'approved').maybeSingle()
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  // ── merchant writes ───────────────────────────────────────────────────────

  private async ownedVendorId(userId: string): Promise<string> {
    const row = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  /** The merchant's own catalogue, at any vendor status — they manage it while the shop is still pending. */
  async listMine(userId: string, query: ProductQuery): Promise<Page<ProductResponse>> {
    const vendorId = await this.ownedVendorId(userId);
    // `approvedOnly: false` — the merchant manages their catalogue while the
    // shop is still pending, so their own listing must not apply the shopper's
    // approved-shops-only rule to them.
    return this.page({ vendorId, approvedOnly: false }, query);
  }

  /**
   * One of the merchant's own products, at any vendor status — what the editor
   * opens. `byId` is the shopper's read and hides every product of a shop that
   * is not approved, so a pending merchant could stock a product and then never
   * open it again. Another shop's id answers 404, like a missing one.
   */
  async byIdMine(userId: string, id: string): Promise<ProductResponse> {
    const vendorId = await this.ownedVendorId(userId);
    const row = await unwrap<ProductRow | null>(
      this.db.from('products').select(PRODUCT_COLUMNS).eq('id', id).eq('vendor_id', vendorId).maybeSingle()
    );
    if (!row) throw new NotFoundException('Product not found');
    return toProduct(row);
  }

  /**
   * A section belongs to one shop, so a merchant filing a product under someone
   * else's section id would otherwise put their product on another shop's page.
   * Checked as "this section, owned by this vendor" rather than trusting the FK,
   * which only knows the section exists.
   */
  private async assertOwnedRefs(vendorId: string, categoryId: string, sectionId: string): Promise<void> {
    const section = await unwrap<{ id: string } | null>(
      this.db.from('vendor_sections').select('id').eq('id', sectionId).eq('vendor_id', vendorId).maybeSingle()
    );
    if (!section) throw new NotFoundException('Section not found in this shop');

    const category = await unwrap<{ id: string } | null>(
      this.db.from('categories').select('id').eq('id', categoryId).maybeSingle()
    );
    if (!category) throw new NotFoundException('Category not found');
  }

  async create(userId: string, input: CreateProductInput): Promise<ProductResponse> {
    const vendorId = await this.ownedVendorId(userId);
    await this.assertOwnedRefs(vendorId, input.categoryId, input.sectionId);
    assertMediaPath(input.imageUrl, PRODUCT_MEDIA_BUCKET, vendorId, 'imageUrl');

    const created = await unwrap<ProductRow>(
      this.db
        .from('products')
        .insert({
          vendor_id: vendorId,
          category_id: input.categoryId,
          section_id: input.sectionId,
          name: input.name,
          description: input.description,
          price_cad: input.priceCad,
          compare_at_price_cad: input.compareAtPriceCad ?? null,
          image_url: input.imageUrl,
          stock_qty: input.stockQty,
          is_available: input.isAvailable,
          tags: input.tags,
          nutrition_calories: input.nutrition?.calories ?? null,
          nutrition_protein_g: input.nutrition?.proteinG ?? null,
          nutrition_fat_g: input.nutrition?.fatG ?? null,
          nutrition_weight_g: input.nutrition?.weightG ?? null,
        })
        .select(PRODUCT_COLUMNS)
        .single()
    );
    return toProduct(created);
  }

  async update(userId: string, id: string, patch: UpdateProductInput): Promise<ProductResponse> {
    const vendorId = await this.ownedVendorId(userId);

    const current = await unwrap<ProductRow | null>(
      this.db.from('products').select(PRODUCT_COLUMNS).eq('id', id).eq('vendor_id', vendorId).maybeSingle()
    );
    // A 404, not a 403, so an id you don't own doesn't confirm it exists —
    // same rule as `AddressesService.findOwned`.
    if (!current) throw new NotFoundException('Product not found');

    if (patch.sectionId !== undefined || patch.categoryId !== undefined) {
      await this.assertOwnedRefs(vendorId, patch.categoryId ?? current.categoryId, patch.sectionId ?? current.sectionId);
    }
    if (patch.imageUrl !== undefined) assertMediaPath(patch.imageUrl, PRODUCT_MEDIA_BUCKET, vendorId, 'imageUrl');

    // The "was" price has to be re-checked against whichever price ends up on
    // the row: lowering `compareAtPriceCad` and raising `priceCad` are each
    // fine alone and invalid together, and a patch can send either one.
    const nextPrice = patch.priceCad ?? Number(current.priceCad);
    const nextCompare =
      patch.compareAtPriceCad === undefined
        ? current.compareAtPriceCad === null
          ? null
          : Number(current.compareAtPriceCad)
        : patch.compareAtPriceCad;
    if (nextCompare !== null && nextCompare <= nextPrice) {
      throw new BadRequestException('Le prix barré doit être supérieur au prix de vente');
    }

    const updated = await unwrap<ProductRow | null>(
      this.db
        .from('products')
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
          ...(patch.sectionId !== undefined ? { section_id: patch.sectionId } : {}),
          ...(patch.priceCad !== undefined ? { price_cad: patch.priceCad } : {}),
          ...(patch.compareAtPriceCad !== undefined ? { compare_at_price_cad: patch.compareAtPriceCad } : {}),
          ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
          ...(patch.stockQty !== undefined ? { stock_qty: patch.stockQty } : {}),
          ...(patch.isAvailable !== undefined ? { is_available: patch.isAvailable } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          // `null` clears the whole block; absent leaves it alone. The four
          // columns are always written together — a half-set would draw the
          // product page's nutrition strip with holes in it.
          ...(patch.nutrition !== undefined
            ? patch.nutrition === null
              ? {
                  nutrition_calories: null,
                  nutrition_protein_g: null,
                  nutrition_fat_g: null,
                  nutrition_weight_g: null,
                }
              : {
                  nutrition_calories: patch.nutrition.calories,
                  nutrition_protein_g: patch.nutrition.proteinG,
                  nutrition_fat_g: patch.nutrition.fatG,
                  nutrition_weight_g: patch.nutrition.weightG,
                }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('vendor_id', vendorId)
        .select(PRODUCT_COLUMNS)
        .maybeSingle()
    );
    // The existence check above and this update are separate statements: the
    // row can be deleted in between (the merchant's own second device, say).
    // Without this guard `toProduct(undefined)` throws a TypeError and the
    // caller gets a 500 instead of the 404 that actually describes it.
    if (!updated) throw new NotFoundException('Product not found');
    return toProduct(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const vendorId = await this.ownedVendorId(userId);
    const deleted = await unwrap<{ id: string }[]>(
      this.db.from('products').delete().eq('id', id).eq('vendor_id', vendorId).select('id')
    );
    if (deleted.length === 0) throw new NotFoundException('Product not found');
  }

  /**
   * Somewhere to upload one product photo — see `createMediaUpload`. Allowed
   * while the shop is pending: a merchant stocks the shelves before approval,
   * and that is when the photos go in.
   */
  async createImageUpload(userId: string, input: MediaImageUploadInput) {
    return createMediaUpload(this.db, PRODUCT_MEDIA_BUCKET, await this.ownedVendorId(userId), input);
  }
}
