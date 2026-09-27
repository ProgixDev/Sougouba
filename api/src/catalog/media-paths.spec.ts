import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { assertMediaPath, PRODUCT_MEDIA_BUCKET, VENDOR_MEDIA_BUCKET } from './media-paths.js';

const VENDOR = '11111111-1111-4111-8111-111111111111';
const OTHER_VENDOR = '22222222-2222-4222-8222-222222222222';

describe('assertMediaPath', () => {
  it('accepts a path under this vendor’s own prefix', () => {
    const path = `${VENDOR_MEDIA_BUCKET}/${VENDOR}/logo.png`;
    expect(assertMediaPath(path, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')).toBe(path);
  });

  it('accepts an empty string — a shop with no photography yet', () => {
    expect(assertMediaPath('', VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')).toBe('');
  });

  it('refuses another vendor’s folder', () => {
    // The attack this closes: the *file* is protected by a Storage policy, but
    // the row that points at it is written through this API. Without this
    // check a merchant could set their cover image to a competitor's object.
    expect(() =>
      assertMediaPath(`${VENDOR_MEDIA_BUCKET}/${OTHER_VENDOR}/logo.png`, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')
    ).toThrow(BadRequestException);
  });

  it('refuses the wrong bucket', () => {
    expect(() =>
      assertMediaPath(`${PRODUCT_MEDIA_BUCKET}/${VENDOR}/photo.png`, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')
    ).toThrow(BadRequestException);
  });

  it('refuses an absolute URL', () => {
    // Storing one would pin the image to today's project hostname; a restore
    // into a different Supabase project would silently serve nothing.
    expect(() =>
      assertMediaPath(
        `https://wyjkaiquugoblvvzpjnq.supabase.co/storage/v1/object/public/${VENDOR_MEDIA_BUCKET}/${VENDOR}/logo.png`,
        VENDOR_MEDIA_BUCKET,
        VENDOR,
        'logoUrl'
      )
    ).toThrow(BadRequestException);
  });

  it('refuses traversal and nesting past the vendor folder', () => {
    expect(() => assertMediaPath(`${VENDOR_MEDIA_BUCKET}/${VENDOR}/../${OTHER_VENDOR}/logo.png`, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')).toThrow(
      BadRequestException
    );
    expect(() => assertMediaPath(`${VENDOR_MEDIA_BUCKET}/${VENDOR}/`, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')).toThrow(
      BadRequestException
    );
  });

  it('refuses a prefix that only looks like the vendor folder', () => {
    // `startsWith(vendorId)` without the trailing slash would accept a folder
    // named `<vendorId>-evil`.
    expect(() =>
      assertMediaPath(`${VENDOR_MEDIA_BUCKET}/${VENDOR}-evil/logo.png`, VENDOR_MEDIA_BUCKET, VENDOR, 'logoUrl')
    ).toThrow(BadRequestException);
  });
});
