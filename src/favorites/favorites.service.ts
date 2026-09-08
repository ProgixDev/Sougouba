import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

/** Postgres's own codes — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class FavoritesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  listProducts(profileId: string): Promise<{ productId: string }[]> {
    return unwrap<{ productId: string }[]>(
      this.db.from('favorite_products').select('productId:product_id').eq('profile_id', profileId)
    );
  }

  listVendors(profileId: string): Promise<{ vendorId: string }[]> {
    return unwrap<{ vendorId: string }[]>(
      this.db.from('favorite_vendors').select('vendorId:vendor_id').eq('profile_id', profileId)
    );
  }

  async addProduct(profileId: string, productId: string): Promise<void> {
    await this.insertIgnoringDuplicate('favorite_products', { profile_id: profileId, product_id: productId });
  }

  async removeProduct(profileId: string, productId: string): Promise<void> {
    await unwrap(
      this.db.from('favorite_products').delete().eq('profile_id', profileId).eq('product_id', productId)
    );
  }

  async addVendor(profileId: string, vendorId: string): Promise<void> {
    await this.insertIgnoringDuplicate('favorite_vendors', { profile_id: profileId, vendor_id: vendorId });
  }

  async removeVendor(profileId: string, vendorId: string): Promise<void> {
    await unwrap(this.db.from('favorite_vendors').delete().eq('profile_id', profileId).eq('vendor_id', vendorId));
  }

  /**
   * Favoriting is idempotent from the caller's point of view — tapping an
   * already-filled heart twice is not an error — so a duplicate-key conflict
   * (the composite primary key) is swallowed. A foreign-key violation (the
   * product/vendor id doesn't exist) is a real 404, not silently ignored.
   *
   * ⚠️ Drizzle's `onConflictDoNothing()` has no PostgREST equivalent: `upsert`
   * with `ignoreDuplicates` is the near-miss, but it needs the conflict target
   * spelled out and still reports the FK failure the same way. Reading the
   * SQLSTATE off the returned error is both simpler and closer to what this
   * method always meant — the two outcomes are told apart by code, not by
   * whether something threw.
   */
  private async insertIgnoringDuplicate(
    table: 'favorite_products' | 'favorite_vendors',
    values: Record<string, string>
  ): Promise<void> {
    const { error } = await this.db.from(table).insert(values as never);
    if (!error) return;
    if (error.code === UNIQUE_VIOLATION) return;
    if (error.code === FOREIGN_KEY_VIOLATION) throw new NotFoundException('That product or vendor does not exist');
    throw asUnexpected(error);
  }
}

function asUnexpected(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '');
  return new Error('Database request failed');
}
