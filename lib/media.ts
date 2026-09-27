/**
 * A Storage path from the API → a URL the app can load.
 *
 * The API stores media as `<bucket>/<vendorId>/<file>` (see `assertMediaPath`
 * in `api/src/catalog/media-paths.ts`) and returns it as stored. Both media
 * buckets are public, so the object URL needs no signing. Anything already
 * absolute passes through; empty means "no photo".
 */
const PUBLIC_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${PUBLIC_BASE}/${path.replace(/^\/+/, '')}`;
}
