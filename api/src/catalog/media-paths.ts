import { randomUUID } from 'node:crypto';

import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';

import type { Db } from '../db/client.js';

/**
 * Image handling, and why there is no upload endpoint here.
 *
 * Phase 2's brief calls for "image upload endpoints" for vendor logo/cover and
 * product photos. The bytes deliberately do **not** flow through this API:
 * the mobile app already holds a Supabase session (Phase 1), so it uploads
 * straight to Storage with that session, and Storage's own RLS policies decide
 * whether it may. Routing multipart bodies through Nest instead would buy
 * nothing — the same authorization question, asked in a second place, plus a
 * Node process holding image buffers in memory.
 *
 * What this API owns is the *reference*: a merchant PATCHes a path, and these
 * checks make sure it is a path into the right bucket, under their own vendor's
 * prefix. Without that, a merchant could set their cover image to any object in
 * the bucket — including one belonging to another shop — because the write that
 * matters (the row, not the file) comes through here.
 *
 * The prefix rule is the same one the Storage policies enforce, stated twice on
 * purpose: `<bucket>/<vendorId>/<filename>`.
 */

export const VENDOR_MEDIA_BUCKET = 'vendor-media';
/** Private: identity papers, permits, bank letters. Read only through signed URLs. */
export const MERCHANT_DOCUMENTS_BUCKET = 'merchant-documents';
export const PRODUCT_MEDIA_BUCKET = 'product-media';

/**
 * What a shop or product photo may be, and the extension it is stored under.
 *
 * Narrower than the registration documents: no PDF, and no HEIC — these photos
 * are shown to every shopper, and Android cannot draw HEIC. iOS hands the
 * picker's result back as JPEG once `quality` is below 1, so this costs the
 * merchant nothing.
 */
export const MEDIA_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export const mediaImageUploadSchema = z.object({
  contentType: z.enum(Object.keys(MEDIA_IMAGE_TYPES) as [keyof typeof MEDIA_IMAGE_TYPES], {
    message: 'Format accepté : JPEG, PNG ou WebP',
  }),
});

export type MediaImageUploadInput = z.infer<typeof mediaImageUploadSchema>;

/**
 * A one-shot signed upload URL for one photo under `<bucket>/<vendorId>/`.
 *
 * The API picks the whole path, with a random name, so the device never names
 * a file: it cannot write into another shop's folder or over an existing
 * photo. The returned `path` is the `<bucket>/<vendorId>/<file>` form that
 * {@link assertMediaPath} then accepts on the row.
 *
 * ⚠️ A replaced or abandoned photo stays in the bucket — nothing purges
 * unreferenced files yet.
 */
export async function createMediaUpload(db: Db, bucket: string, vendorId: string, input: MediaImageUploadInput) {
  const file = `${vendorId}/${randomUUID()}.${MEDIA_IMAGE_TYPES[input.contentType]}`;
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(file);
  if (error || !data) throw new InternalServerErrorException('Could not prepare the upload');
  return { path: `${bucket}/${file}`, uploadUrl: data.signedUrl, contentType: input.contentType };
}

/**
 * Accepts an empty string (the seeded value — `CatalogImage` draws a stable
 * tinted placeholder from the row id, so a shop with no photography still has
 * a face) or a `<bucket>/<vendorId>/<filename>` path. A full `https://…` URL is
 * rejected: storing an absolute URL would pin every image to today's project
 * hostname, and a restore into a different Supabase project would silently
 * serve nothing.
 */
export function assertMediaPath(
  value: string,
  bucket: string,
  vendorId: string,
  field: string
): string {
  if (value === '') return value;

  const expectedPrefix = `${bucket}/${vendorId}/`;
  if (!value.startsWith(expectedPrefix)) {
    throw new BadRequestException(
      `${field}: expected a path under "${expectedPrefix}" (got "${value}"). Upload to Storage first, then send the returned path — not an absolute URL.`
    );
  }

  const filename = value.slice(expectedPrefix.length);
  // No traversal, no nesting, no empty name — the Storage policy matches on the
  // first path segment, so anything clever after it is worth refusing outright.
  if (!filename || filename.includes('/') || filename.includes('..')) {
    throw new BadRequestException(`${field}: "${filename}" is not a valid file name`);
  }

  return value;
}
