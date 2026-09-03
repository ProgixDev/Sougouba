-- Catalog domain RLS, replacing Phase 0's placeholder (RLS enabled, no
-- policies) on every table this phase touches.
--
-- Same defense-in-depth stance as `0005_identity_rls_policies.sql`: the NestJS
-- API connects as the table owner and is not gated by any of this, so these
-- policies exist for the *other* path — the mobile app's own direct Supabase
-- client (Storage, Realtime, and any future PostgREST read) — and as the last
-- line if an API guard is ever wrong.
--
-- The rule the whole catalogue turns on: a shop the platform has not approved
-- is not browsable by anyone except the merchant who owns it.

-- ⚠️ Both helpers were moved to the `private` schema in `0010` — creating them
-- in `public` published them as PostgREST RPC endpoints. Read `0010` for the
-- current definitions; these two are dropped there.
--
-- Two helpers so that rule is written once rather than restated in eleven
-- policies. SECURITY DEFINER because a policy on `products` that sub-selected
-- `vendors` would otherwise re-enter `vendors`' own policies on every row;
-- STABLE so the planner may call them once per statement rather than per row.
-- `search_path = ''` per Supabase's own hardening guidance — every name inside
-- is schema-qualified, so nothing here can be hijacked by a caller's path.
create or replace function public.vendor_is_visible(v_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = v_id
      and (v.status = 'approved' or v.owner_id = (select auth.uid()))
  );
$$;
--> statement-breakpoint

create or replace function public.owns_vendor(v_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = v_id and v.owner_id = (select auth.uid())
  );
$$;
--> statement-breakpoint

-- categories: the platform taxonomy is public, and readable before sign-in —
-- the home screen's category grid renders for a signed-out browser. Writes are
-- admin-only and go through the service-role connection (Phase 8), so there is
-- deliberately no INSERT/UPDATE/DELETE policy here.
create policy "categories_select_all" on public.categories
  for select to anon, authenticated
  using (true);
--> statement-breakpoint

-- vendors: approved shops are public; a merchant additionally sees their own at
-- any status (that is how a pending applicant watches their own queue position).
create policy "vendors_select_visible" on public.vendors
  for select to anon, authenticated
  using (status = 'approved' or owner_id = (select auth.uid()));
--> statement-breakpoint

create policy "vendors_insert_own" on public.vendors
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
--> statement-breakpoint

-- ⚠️ This policy alone was NOT enough — see `0009_catalog_column_privileges.sql`,
-- which closes the hole it leaves. No `status` protection is expressible in a
-- WITH CHECK that also has to allow the merchant to edit their name, so with
-- only this migration applied a merchant could self-approve their own shop over
-- PostgREST. Column privileges, not policies, are what forbid that; `0009`
-- grants UPDATE on the shopfront columns only.
create policy "vendors_update_own" on public.vendors
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
--> statement-breakpoint

-- vendor_registrations: NEQ, the responsible person's name and their phone
-- number. Never public, not even for an approved shop -- the storefront needs
-- none of it. Owner-only, and admins read it over the service-role connection.
create policy "vendor_registrations_select_own" on public.vendor_registrations
  for select to authenticated
  using (public.owns_vendor(vendor_id));
--> statement-breakpoint

create policy "vendor_registrations_insert_own" on public.vendor_registrations
  for insert to authenticated
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

create policy "vendor_registrations_update_own" on public.vendor_registrations
  for update to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

-- vendor_sections / vendor_hours / vendor_categories / products: readable
-- exactly when their shop is, writable only by the merchant who owns it.
create policy "vendor_sections_select_visible" on public.vendor_sections
  for select to anon, authenticated
  using (public.vendor_is_visible(vendor_id));
--> statement-breakpoint

create policy "vendor_sections_write_own" on public.vendor_sections
  for all to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

create policy "vendor_hours_select_visible" on public.vendor_hours
  for select to anon, authenticated
  using (public.vendor_is_visible(vendor_id));
--> statement-breakpoint

create policy "vendor_hours_write_own" on public.vendor_hours
  for all to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

create policy "vendor_categories_select_visible" on public.vendor_categories
  for select to anon, authenticated
  using (public.vendor_is_visible(vendor_id));
--> statement-breakpoint

create policy "vendor_categories_write_own" on public.vendor_categories
  for all to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

create policy "products_select_visible" on public.products
  for select to anon, authenticated
  using (public.vendor_is_visible(vendor_id));
--> statement-breakpoint

create policy "products_write_own" on public.products
  for all to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));
--> statement-breakpoint

-- ── Storage ────────────────────────────────────────────────────────────────
-- Phase 0 created these buckets with no policies. The bytes never pass through
-- the API (see `src/catalog/media-paths.ts` for why): the app uploads straight
-- to Storage with its own session, and these policies are what decide whether
-- it may. Objects are keyed `<vendor_id>/<filename>`, the same prefix rule the
-- API re-checks before it will store a path on a row.
--
-- The folder segment is compared as *text* against the caller's own vendor ids
-- rather than cast to uuid: a file uploaded under a non-uuid folder name would
-- make `::uuid` raise, and a policy that errors is a policy that stops working.
create policy "vendor_media_write_own_folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'vendor-media'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'vendor-media'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  );
--> statement-breakpoint

create policy "product_media_write_own_folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'product-media'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'product-media'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  );
--> statement-breakpoint

-- merchant-documents is a *private* bucket, so unlike the two above there is no
-- CDN path around RLS: this policy is the only way the bytes are reachable at
-- all, and it grants the owning merchant and nobody else. An administrator
-- reviewing a registration reads them over the service-role connection
-- (Phase 8), which is not subject to these policies.
create policy "merchant_documents_own_folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'merchant-documents'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'merchant-documents'
    and (storage.foldername(name))[1] in (select v.id::text from public.vendors v where v.owner_id = (select auth.uid()))
  );
