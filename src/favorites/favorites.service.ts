import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { favoriteProducts, favoriteVendors } from '../db/schema/index.js';

/** Postgres's own code for "foreign key violation" — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class FavoritesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  listProducts(profileId: string) {
    return this.db.select({ productId: favoriteProducts.productId }).from(favoriteProducts).where(eq(favoriteProducts.profileId, profileId));
  }

  listVendors(profileId: string) {
    return this.db.select({ vendorId: favoriteVendors.vendorId }).from(favoriteVendors).where(eq(favoriteVendors.profileId, profileId));
  }

  async addProduct(profileId: string, productId: string): Promise<void> {
    await this.insertIgnoringDuplicate(favoriteProducts, { profileId, productId });
  }

  async removeProduct(profileId: string, productId: string): Promise<void> {
    await this.db.delete(favoriteProducts).where(and(eq(favoriteProducts.profileId, profileId), eq(favoriteProducts.productId, productId)));
  }

  async addVendor(profileId: string, vendorId: string): Promise<void> {
    await this.insertIgnoringDuplicate(favoriteVendors, { profileId, vendorId });
  }

  async removeVendor(profileId: string, vendorId: string): Promise<void> {
    await this.db.delete(favoriteVendors).where(and(eq(favoriteVendors.profileId, profileId), eq(favoriteVendors.vendorId, vendorId)));
  }

  /**
   * Favoriting is idempotent from the caller's point of view — tapping an
   * already-filled heart twice is not an error — so a duplicate-key conflict
   * (the composite primary key) is swallowed. A foreign-key violation (the
   * product/vendor id doesn't exist) is a real 404, not silently ignored.
   */
  private async insertIgnoringDuplicate(table: PgTable, values: Record<string, string>): Promise<void> {
    try {
      await this.db.insert(table).values(values).onConflictDoNothing();
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new NotFoundException('That product or vendor does not exist');
      throw error;
    }
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === FOREIGN_KEY_VIOLATION;
}
