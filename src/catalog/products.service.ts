import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { categories, products, vendorSections, vendors } from '../db/schema/index.js';
import {
  PRICE_BANDS,
  type CreateProductInput,
  type ProductQuery,
  type ProductSearchQuery,
  type SortKey,
  type UpdateProductInput,
} from './dto/product.dto.js';
import type { Page } from './dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import { assertMediaPath, PRODUCT_MEDIA_BUCKET } from './media-paths.js';
import { toProduct, type ProductResponse, type ProductRow } from './mappers.js';

const productColumns = {
  id: products.id,
  vendorId: products.vendorId,
  categoryId: products.categoryId,
  sectionId: products.sectionId,
  name: products.name,
  description: products.description,
  priceCad: products.priceCad,
  compareAtPriceCad: products.compareAtPriceCad,
  imageUrl: products.imageUrl,
  stockQty: products.stockQty,
  isAvailable: products.isAvailable,
  tags: products.tags,
  nutritionCalories: products.nutritionCalories,
  nutritionProteinG: products.nutritionProteinG,
  nutritionFatG: products.nutritionFatG,
  nutritionWeightG: products.nutritionWeightG,
};

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * `lib/productFilters.ts`'s `applyFilters`, moved into the database.
   *
   * The mobile version narrows and sorts an array the phone already holds;
   * every rule it applies is reproduced here as a `WHERE`/`ORDER BY` so the
   * phone can stop holding the array at all. The band comparisons keep their
   * asymmetry (`>= min`, `< max`) for the reason `PRICE_BANDS` documents.
   */
  private filters(query: ProductQuery): SQL[] {
    const conditions: SQL[] = [];
    const [min, max] = PRICE_BANDS[query.priceBand];

    if (min !== null) conditions.push(gte(products.priceCad, String(min)));
    if (max !== null) conditions.push(lt(products.priceCad, String(max)));
    if (query.onSale) conditions.push(sql`${products.compareAtPriceCad} is not null`);
    if (query.inStockOnly) conditions.push(and(eq(products.isAvailable, true), sql`${products.stockQty} > 0`)!);
    if (query.sectionId) conditions.push(eq(products.sectionId, query.sectionId));
    if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
    if (query.q) {
      // Escaped: unescaped, `?q=%` builds the pattern `%%%` and returns the
      // whole catalogue — the opposite of the literal `name.includes(q)` this
      // ports. See `common/sql/like.ts`.
      const term = containsPattern(query.q);
      // Name or any one tag — the same test `searchProducts` makes, with the
      // array membership pushed into Postgres rather than a `.some()` per row.
      conditions.push(
        or(ilike(products.name, term), sql`exists (select 1 from unnest(${products.tags}) tag where tag ilike ${term})`)!
      );
    }
    return conditions;
  }

  /**
   * `relevance` keeps the catalogue's own order rather than imposing one —
   * matching the mobile default, which returns the incoming array untouched.
   * "Untouched" needs a tiebreak here that an array doesn't: without a stable
   * `ORDER BY`, Postgres may return page 2 overlapping page 1.
   *
   * `name` sorts under the `fr-CA` collation so "Épices" files under E, where
   * `localeCompare(…, 'fr-CA')` puts it on the phone — a plain byte sort would
   * push every accented name to the end of the list.
   */
  private ordering(sort: SortKey): SQL[] {
    switch (sort) {
      case 'price_asc':
        return [asc(products.priceCad), asc(products.id)];
      case 'price_desc':
        return [desc(products.priceCad), asc(products.id)];
      case 'name':
        return [sql`${products.name} collate "fr-CA-x-icu" asc`, asc(products.id)];
      default:
        return [asc(products.createdAt), asc(products.id)];
    }
  }

  private async page(where: SQL, query: ProductQuery): Promise<Page<ProductResponse>> {
    const [rows, [counted]] = await Promise.all([
      this.db
        .select(productColumns)
        .from(products)
        .where(where)
        .orderBy(...this.ordering(query.sort))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(products).where(where),
    ]);

    return {
      items: rows.map((r) => toProduct(r as ProductRow)),
      total: counted?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /** A shopper's view of one shop's shelves — approved shops only, same rule as the vendor list. */
  async listForVendor(vendorId: string, query: ProductQuery): Promise<Page<ProductResponse>> {
    await this.assertApprovedVendor(vendorId);
    return this.page(and(eq(products.vendorId, vendorId), ...this.filters(query))!, query);
  }

  /** Platform-wide search across every approved shop. */
  async search(query: ProductSearchQuery): Promise<Page<ProductResponse>> {
    const conditions = [
      sql`exists (select 1 from ${vendors} v where v.id = ${products.vendorId} and v.status = 'approved')`,
      ...this.filters(query),
    ];
    if (query.vendorId) conditions.push(eq(products.vendorId, query.vendorId));
    return this.page(and(...conditions)!, query);
  }

  async byId(id: string): Promise<ProductResponse> {
    const [row] = await this.db
      .select(productColumns)
      .from(products)
      .where(
        and(
          eq(products.id, id),
          sql`exists (select 1 from ${vendors} v where v.id = ${products.vendorId} and v.status = 'approved')`
        )
      )
      .limit(1);
    if (!row) throw new NotFoundException('Product not found');
    return toProduct(row as ProductRow);
  }

  private async assertApprovedVendor(vendorId: string): Promise<void> {
    const [vendor] = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.status, 'approved')))
      .limit(1);
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  // ── merchant writes ───────────────────────────────────────────────────────

  private async ownedVendorId(userId: string): Promise<string> {
    const [row] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  /** The merchant's own catalogue, at any vendor status — they manage it while the shop is still pending. */
  async listMine(userId: string, query: ProductQuery): Promise<Page<ProductResponse>> {
    const vendorId = await this.ownedVendorId(userId);
    return this.page(and(eq(products.vendorId, vendorId), ...this.filters(query))!, query);
  }

  /**
   * A section belongs to one shop, so a merchant filing a product under someone
   * else's section id would otherwise put their product on another shop's page.
   * Checked as "this section, owned by this vendor" rather than trusting the FK,
   * which only knows the section exists.
   */
  private async assertOwnedRefs(vendorId: string, categoryId: string, sectionId: string): Promise<void> {
    const [section] = await this.db
      .select({ id: vendorSections.id })
      .from(vendorSections)
      .where(and(eq(vendorSections.id, sectionId), eq(vendorSections.vendorId, vendorId)))
      .limit(1);
    if (!section) throw new NotFoundException('Section not found in this shop');

    const [category] = await this.db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!category) throw new NotFoundException('Category not found');
  }

  async create(userId: string, input: CreateProductInput): Promise<ProductResponse> {
    const vendorId = await this.ownedVendorId(userId);
    await this.assertOwnedRefs(vendorId, input.categoryId, input.sectionId);
    assertMediaPath(input.imageUrl, PRODUCT_MEDIA_BUCKET, vendorId, 'imageUrl');

    const [created] = await this.db
      .insert(products)
      .values({
        vendorId,
        categoryId: input.categoryId,
        sectionId: input.sectionId,
        name: input.name,
        description: input.description,
        priceCad: String(input.priceCad),
        compareAtPriceCad: input.compareAtPriceCad === undefined ? null : String(input.compareAtPriceCad),
        imageUrl: input.imageUrl,
        stockQty: input.stockQty,
        isAvailable: input.isAvailable,
        tags: input.tags,
        nutritionCalories: input.nutrition?.calories ?? null,
        nutritionProteinG: input.nutrition ? String(input.nutrition.proteinG) : null,
        nutritionFatG: input.nutrition ? String(input.nutrition.fatG) : null,
        nutritionWeightG: input.nutrition ? String(input.nutrition.weightG) : null,
      })
      .returning(productColumns);
    return toProduct(created as ProductRow);
  }

  async update(userId: string, id: string, patch: UpdateProductInput): Promise<ProductResponse> {
    const vendorId = await this.ownedVendorId(userId);

    const [current] = await this.db
      .select(productColumns)
      .from(products)
      .where(and(eq(products.id, id), eq(products.vendorId, vendorId)))
      .limit(1);
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

    const [updated] = await this.db
      .update(products)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
        ...(patch.priceCad !== undefined ? { priceCad: String(patch.priceCad) } : {}),
        ...(patch.compareAtPriceCad !== undefined
          ? { compareAtPriceCad: patch.compareAtPriceCad === null ? null : String(patch.compareAtPriceCad) }
          : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
        ...(patch.stockQty !== undefined ? { stockQty: patch.stockQty } : {}),
        ...(patch.isAvailable !== undefined ? { isAvailable: patch.isAvailable } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        // `null` clears the whole block; absent leaves it alone. The four
        // columns are always written together — a half-set would draw the
        // product page's nutrition strip with holes in it.
        ...(patch.nutrition !== undefined
          ? patch.nutrition === null
            ? { nutritionCalories: null, nutritionProteinG: null, nutritionFatG: null, nutritionWeightG: null }
            : {
                nutritionCalories: patch.nutrition.calories,
                nutritionProteinG: String(patch.nutrition.proteinG),
                nutritionFatG: String(patch.nutrition.fatG),
                nutritionWeightG: String(patch.nutrition.weightG),
              }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.vendorId, vendorId)))
      .returning(productColumns);
    // The existence check above and this update are separate statements: the
    // row can be deleted in between (the merchant's own second device, say).
    // Without this guard `toProduct(undefined)` throws a TypeError and the
    // caller gets a 500 instead of the 404 that actually describes it.
    if (!updated) throw new NotFoundException('Product not found');
    return toProduct(updated as ProductRow);
  }

  async remove(userId: string, id: string): Promise<void> {
    const vendorId = await this.ownedVendorId(userId);
    const deleted = await this.db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.vendorId, vendorId)))
      .returning({ id: products.id });
    if (deleted.length === 0) throw new NotFoundException('Product not found');
  }
}
