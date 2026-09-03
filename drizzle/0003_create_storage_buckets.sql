-- Public: served straight from Storage's CDN, no signed URL — matches how
-- the mock's `CatalogImage` already expects a plain `imageUrl`/`logoUrl`.
insert into storage.buckets (id, name, public)
values
  ('vendor-media', 'vendor-media', true),
  ('product-media', 'product-media', true)
on conflict (id) do nothing;
--> statement-breakpoint

-- Private: legal documents and delivery proof — never a bare public URL.
-- Phase 2/5/8 read these via signed URLs, gated by RLS policies on
-- `storage.objects` that don't exist yet (Phase 0's placeholder: enabled RLS,
-- private bucket, zero policies — nobody but the API's own service-role
-- connection can touch these until then).
insert into storage.buckets (id, name, public)
values
  ('merchant-documents', 'merchant-documents', false),
  ('courier-documents', 'courier-documents', false),
  ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do nothing;
