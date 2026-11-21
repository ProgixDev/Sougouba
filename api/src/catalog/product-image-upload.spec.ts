import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { productImageUploadSchema } from './dto/product.dto.js';
import { assertMediaPath, PRODUCT_MEDIA_BUCKET } from './media-paths.js';
import { ProductsService } from './products.service.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const VENDOR = '5eed0000-0000-4000-8000-000000000001';

/** Just enough of the Supabase client for `ownedVendorId` and one signed upload. */
function fakeDb({ vendor = { id: VENDOR }, uploadError = null as unknown } = {}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: vendor, error: null }),
  };
  const createSignedUploadUrl = vi.fn((path: string) =>
    Promise.resolve(
      uploadError
        ? { data: null, error: uploadError }
        : { data: { signedUrl: `https://storage.test/upload/${path}?token=t`, path, token: 't' }, error: null }
    )
  );
  const from = vi.fn(() => ({ createSignedUploadUrl }));
  const db = { from: () => query, storage: { from } } as unknown as Db;
  return { db, from, createSignedUploadUrl };
}

describe('product photo upload', () => {
  it('accepts the formats every phone can draw, and only those', () => {
    for (const contentType of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(productImageUploadSchema.safeParse({ contentType }).success).toBe(true);
    }
    for (const contentType of ['image/heic', 'application/pdf', 'image/gif', '']) {
      expect(productImageUploadSchema.safeParse({ contentType }).success).toBe(false);
    }
  });

  it("signs a fresh path in the merchant's own folder, which imageUrl then accepts", async () => {
    const { db, from, createSignedUploadUrl } = fakeDb();
    const upload = await new ProductsService(db).createImageUpload(OWNER, { contentType: 'image/png' });

    expect(from).toHaveBeenCalledWith(PRODUCT_MEDIA_BUCKET);
    const signed = createSignedUploadUrl.mock.calls[0][0];
    expect(signed).toMatch(new RegExp(`^${VENDOR}/[0-9a-f-]{36}\\.png$`));
    expect(upload.path).toBe(`${PRODUCT_MEDIA_BUCKET}/${signed}`);
    expect(upload.uploadUrl).toContain(signed);
    expect(assertMediaPath(upload.path, PRODUCT_MEDIA_BUCKET, VENDOR, 'imageUrl')).toBe(upload.path);
  });

  it('never hands out the same path twice', async () => {
    const service = new ProductsService(fakeDb().db);
    const a = await service.createImageUpload(OWNER, { contentType: 'image/jpeg' });
    const b = await service.createImageUpload(OWNER, { contentType: 'image/jpeg' });
    expect(a.path).not.toBe(b.path);
  });

  it('refuses an account with no shop', async () => {
    const service = new ProductsService(fakeDb({ vendor: null as never }).db);
    await expect(service.createImageUpload(OWNER, { contentType: 'image/jpeg' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('reports a Storage failure as a server error, not a bad request', async () => {
    const service = new ProductsService(fakeDb({ uploadError: new Error('down') }).db);
    await expect(service.createImageUpload(OWNER, { contentType: 'image/jpeg' })).rejects.toBeInstanceOf(
      InternalServerErrorException
    );
  });
});
