/**
 * Where an uploaded image is served from. The API stores and returns a Storage
 * *path* (`avatars/<user>/<file>.jpg`, `product-media/<shop>/<file>.jpg`); the
 * buckets these live in are public, so the path only needs the project's base
 * URL in front of it. Documents — a courier's licence, a shop's permit — are in
 * private buckets and are never read this way.
 */
const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${PUBLIC_BASE}/${path.replace(/^\/+/, '')}`;
}
