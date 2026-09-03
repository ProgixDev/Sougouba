-- Closes a privilege escalation that `0008`'s policies did not, and could not.
--
-- Found by running the attack rather than reading the policy: with `0008`
-- applied, a merchant holding an ordinary Supabase session could call PostgREST
-- directly and run
--
--     update vendors set status = 'approved' where id = <their own shop>
--
-- successfully. `vendors_update_own` allows a merchant to update their own row,
-- and RLS has no way to say "this row, except four of its columns" — a
-- `WITH CHECK` that also has to permit a rename cannot forbid a status change.
-- Supabase's default grants then hand `authenticated` (and `anon`) table-wide
-- UPDATE on every column, so the policy was the only gate and it was the wrong
-- shape of gate.
--
-- That let a merchant approve their own shop, which defeats the administrator
-- review the CDC puts between "someone registered" and "the shop is on the
-- platform" (addendum v1.1, §02) — the single check that keeps an unvetted shop
-- away from shoppers. Self-rating was open the same way.
--
-- Column privileges are the right tool: RLS decides which *rows*, grants decide
-- which *columns*. `0008`'s comment claiming "the API is what refuses to write
-- status" was wrong — it is true of the API path and says nothing about the
-- direct-Supabase path the mobile app already has a session for.

-- Signed-out shoppers read the catalogue; they never write to it.
revoke insert, update, delete on
  public.categories, public.vendors, public.vendor_registrations,
  public.vendor_sections, public.vendor_hours, public.vendor_categories, public.products
from anon;
--> statement-breakpoint

-- A merchant may edit their shopfront. They may not vouch for it, rate it,
-- rename its public URL, or hand it to someone else.
--
-- Postgres ignores column grants while a table-wide grant stands, so the
-- table-level privilege has to be revoked first and the allowed columns granted
-- back. The list matches `updateVendorSchema` exactly — the API and the
-- database refuse the same set, from two directions.
revoke insert, update, delete on public.vendors from authenticated;
--> statement-breakpoint

grant update (name, specialty_fr, logo_url, cover_url, delivery_eta_min, is_halal_certified, updated_at)
  on public.vendors to authenticated;
--> statement-breakpoint

-- INSERT is revoked rather than column-restricted: registration creates the
-- shop, its registration file, seven rows of hours and four sections in one
-- transaction (`VendorsService.apply`). A direct insert would produce a shop
-- with none of that, so the policy that allowed it is dropped too.
drop policy if exists "vendors_insert_own" on public.vendors;
--> statement-breakpoint

-- The paperwork behind a registration is written by the API in that same
-- transaction. Nothing needs to write it over PostgREST, and it is the most
-- sensitive table in the domain (NEQ, the responsible person, their phone).
-- The owner-only SELECT policy from `0008` stays.
revoke insert, update, delete on public.vendor_registrations from authenticated;
--> statement-breakpoint

drop policy if exists "vendor_registrations_insert_own" on public.vendor_registrations;
--> statement-breakpoint

drop policy if exists "vendor_registrations_update_own" on public.vendor_registrations;
--> statement-breakpoint

-- Products may not be moved between shops. `products_write_own`'s WITH CHECK
-- already refuses a `vendor_id` the caller doesn't own; making the column
-- unwritable means the two cannot disagree.
revoke update (vendor_id) on public.products from authenticated;
