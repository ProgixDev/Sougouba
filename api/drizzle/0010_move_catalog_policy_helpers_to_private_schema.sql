-- `0008` put `vendor_is_visible` and `owns_vendor` in `public`, which PostgREST
-- exposes: both became callable as `/rest/v1/rpc/<name>` by anyone, signed in
-- or not (Supabase's database linter flags this as
-- `anon_security_definer_function_executable`). Neither leaks another user's
-- data — each only reports on the caller's own access — but they are policy
-- plumbing, not API surface, and an endpoint nobody meant to publish is one
-- nobody is checking either.
--
-- EXECUTE cannot simply be revoked: an RLS policy expression is evaluated with
-- the *querying* role's privileges, so `authenticated` genuinely needs EXECUTE
-- or every policy referencing these stops working. A schema PostgREST does not
-- expose keeps the grant and removes the endpoint.
create schema if not exists private;
--> statement-breakpoint

grant usage on schema private to anon, authenticated;
--> statement-breakpoint

create or replace function private.vendor_is_visible(v_id uuid)
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

create or replace function private.owns_vendor(v_id uuid)
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

grant execute on function private.vendor_is_visible(uuid), private.owns_vendor(uuid) to anon, authenticated;
--> statement-breakpoint

-- Repoint every policy that referenced the public copies. Dropped and recreated
-- rather than altered: a policy's expression is not replaceable in place, and
-- the old function cannot be dropped while a policy still depends on it.
drop policy "vendor_registrations_select_own" on public.vendor_registrations;
--> statement-breakpoint
create policy "vendor_registrations_select_own" on public.vendor_registrations
  for select to authenticated using (private.owns_vendor(vendor_id));
--> statement-breakpoint

drop policy "vendor_sections_select_visible" on public.vendor_sections;
--> statement-breakpoint
create policy "vendor_sections_select_visible" on public.vendor_sections
  for select to anon, authenticated using (private.vendor_is_visible(vendor_id));
--> statement-breakpoint

drop policy "vendor_sections_write_own" on public.vendor_sections;
--> statement-breakpoint
create policy "vendor_sections_write_own" on public.vendor_sections
  for all to authenticated
  using (private.owns_vendor(vendor_id)) with check (private.owns_vendor(vendor_id));
--> statement-breakpoint

drop policy "vendor_hours_select_visible" on public.vendor_hours;
--> statement-breakpoint
create policy "vendor_hours_select_visible" on public.vendor_hours
  for select to anon, authenticated using (private.vendor_is_visible(vendor_id));
--> statement-breakpoint

drop policy "vendor_hours_write_own" on public.vendor_hours;
--> statement-breakpoint
create policy "vendor_hours_write_own" on public.vendor_hours
  for all to authenticated
  using (private.owns_vendor(vendor_id)) with check (private.owns_vendor(vendor_id));
--> statement-breakpoint

drop policy "vendor_categories_select_visible" on public.vendor_categories;
--> statement-breakpoint
create policy "vendor_categories_select_visible" on public.vendor_categories
  for select to anon, authenticated using (private.vendor_is_visible(vendor_id));
--> statement-breakpoint

drop policy "vendor_categories_write_own" on public.vendor_categories;
--> statement-breakpoint
create policy "vendor_categories_write_own" on public.vendor_categories
  for all to authenticated
  using (private.owns_vendor(vendor_id)) with check (private.owns_vendor(vendor_id));
--> statement-breakpoint

drop policy "products_select_visible" on public.products;
--> statement-breakpoint
create policy "products_select_visible" on public.products
  for select to anon, authenticated using (private.vendor_is_visible(vendor_id));
--> statement-breakpoint

drop policy "products_write_own" on public.products;
--> statement-breakpoint
create policy "products_write_own" on public.products
  for all to authenticated
  using (private.owns_vendor(vendor_id)) with check (private.owns_vendor(vendor_id));
--> statement-breakpoint

drop function public.vendor_is_visible(uuid);
--> statement-breakpoint

drop function public.owns_vendor(uuid);
