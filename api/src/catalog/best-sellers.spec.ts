import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { bestSellersQuerySchema } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

function fakeDb(result: { data: unknown; error: { code: string; message: string } | null }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { db: { rpc } as unknown as Db, rpc };
}

describe('platform best sellers', () => {
  it('returns the ids in the order the function ranked them', async () => {
    const { db, rpc } = fakeDb({
      data: [
        { product_id: 'b', qty: 9 },
        { product_id: 'a', qty: 4 },
      ],
      error: null,
    });
    await expect(new ProductsService(db).bestSellerIds(6)).resolves.toEqual(['b', 'a']);
    expect(rpc).toHaveBeenCalledWith('product_best_sellers', { p_limit: 6, p_days: 30 });
  });

  it('answers an empty list while the function does not exist yet, so the home screen falls back', async () => {
    for (const code of ['PGRST202', '42883']) {
      const { db } = fakeDb({ data: null, error: { code, message: 'missing' } });
      await expect(new ProductsService(db).bestSellerIds(6)).resolves.toEqual([]);
    }
  });

  it('still fails on any other database error', async () => {
    const { db } = fakeDb({ data: null, error: { code: '57014', message: 'timeout' } });
    await expect(new ProductsService(db).bestSellerIds(6)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('keeps the rail small: 6 by default, 20 at most', () => {
    expect(bestSellersQuerySchema.parse({}).limit).toBe(6);
    expect(bestSellersQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(bestSellersQuerySchema.safeParse({ limit: '21' }).success).toBe(false);
    expect(bestSellersQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});
