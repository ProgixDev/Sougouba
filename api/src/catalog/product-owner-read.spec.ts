import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db/client.js';
import { ProductsService } from './products.service.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const VENDOR = '5eed0000-0000-4000-8000-000000000001';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

const ROW = {
  id: PRODUCT,
  vendorId: VENDOR,
  categoryId: '33333333-3333-4333-8333-333333333333',
  sectionId: '44444444-4444-4444-8444-444444444444',
  name: 'Banane',
  description: 'Banane de l’Équateur',
  priceCad: 2.99,
  compareAtPriceCad: null,
  imageUrl: '',
  stockQty: 30,
  isAvailable: true,
  tags: [],
  nutritionCalories: null,
  nutritionProteinG: null,
  nutritionFatG: null,
  nutritionWeightG: null,
};

/**
 * `vendors` answers the ownership lookup; `products` answers only when every
 * filter the service applied matches the stored row — so a missing
 * `vendor_id` filter, or a status filter, shows up as a wrong result.
 */
function fakeDb(stored: { vendor_id: string; id: string } | null) {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: () => {
        if (table === 'vendors') return Promise.resolve({ data: { id: VENDOR }, error: null });
        const matches =
          stored !== null &&
          Object.keys(filters).every((column) => (stored as Record<string, unknown>)[column] === filters[column]);
        return Promise.resolve({ data: matches ? ROW : null, error: null, filters });
      },
    };
    return query;
  };
  return { from } as unknown as Db;
}

describe("a merchant reading one of their own products", () => {
  it('finds it whatever the shop status — no approved-only filter', async () => {
    const service = new ProductsService(fakeDb({ id: PRODUCT, vendor_id: VENDOR }));
    const product = await service.byIdMine(OWNER, PRODUCT);
    expect(product).toMatchObject({ id: PRODUCT, name: 'Banane' });
  });

  it("answers another shop's product with a 404, like a missing one", async () => {
    const service = new ProductsService(fakeDb({ id: PRODUCT, vendor_id: 'another-shop' }));
    await expect(service.byIdMine(OWNER, PRODUCT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers a missing product with a 404', async () => {
    const service = new ProductsService(fakeDb(null));
    await expect(service.byIdMine(OWNER, PRODUCT)).rejects.toBeInstanceOf(NotFoundException);
  });
});
