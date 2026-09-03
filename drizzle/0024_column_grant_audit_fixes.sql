-- Findings from a full column-grant audit across every table, run because the
-- Phase 6 `profiles` escalation proved that "RLS is the only gate" is a
-- recurring class on this project rather than a one-off.
--
-- The audit itself is worth keeping — it is one query, and it names every table
-- where a write grant covers every column:
--
--   with cols as (
--     select table_name, count(*)::int total_columns from information_schema.columns
--     where table_schema='public' group by table_name),
--   grants as (
--     select table_name, grantee, privilege_type, count(*)::int granted
--     from information_schema.role_column_grants
--     where table_schema='public' and grantee in ('anon','authenticated')
--       and privilege_type in ('INSERT','UPDATE','DELETE')
--     group by table_name, grantee, privilege_type)
--   select g.*, c.total_columns from grants g join cols c using (table_name)
--   where g.granted = c.total_columns;

-- ── 1. addresses: coordinates were self-editable, and that costs money ──────
--
-- Verified as a live exploit, not a theoretical grant. `lat`/`lng` are geocoded
-- server-side, but the row's owner could UPDATE them directly over PostgREST.
-- Moving them next to a shop dropped the delivery fee from 8,99 $ to 2,99 $
-- while `street`/`city`/`postal_code` — where the courier is actually sent —
-- still read an address 16 km away.
--
-- The courier is who pays for it: `order_deliveries.distance_km`, and therefore
-- `earnings_cad`, come from the same coordinates. They drive 16 km and are paid
-- for 0.03.
--
-- Revoked outright rather than column-restricted, because there is no coherent
-- subset: `city` and `postal_code` cannot be edited without re-deriving the
-- coordinates, which is the API's job, and nothing writes an address except
-- `/me/addresses`.
revoke insert, update, delete on public.addresses from anon, authenticated;
--> statement-breakpoint

-- ── 2. products: the Phase 2 fix silently did nothing ──────────────────────
--
-- `0009` ran `revoke update (vendor_id) on public.products from authenticated`.
-- **Postgres ignores a column-level revoke while a table-level grant stands** —
-- the table grant has to go first, which is exactly what the `vendors` fix in
-- that same migration did and what the `products` line forgot. The audit found
-- `vendor_id` still updatable eleven migrations later.
--
-- Nothing was exploitable through it (`products_write_own`'s WITH CHECK refuses
-- a `vendor_id` the caller does not own), but a fix that reads as applied and
-- is not is worse than no fix — it stops anyone looking again.
revoke insert, update, delete on public.products from anon, authenticated;
--> statement-breakpoint

grant insert on public.products to authenticated;
--> statement-breakpoint

grant update (
  name, description, category_id, section_id, price_cad, compare_at_price_cad,
  image_url, stock_qty, is_available, tags,
  nutrition_calories, nutrition_protein_g, nutrition_fat_g, nutrition_weight_g,
  updated_at
) on public.products to authenticated;
--> statement-breakpoint

grant delete on public.products to authenticated;
--> statement-breakpoint

-- ── 3. Tables where RLS was the only gate ──────────────────────────────────
--
-- Each has RLS enabled and no write policy, so writes were already refused —
-- but only for as long as nobody adds a permissive policy for some other
-- reason. Revoking states the intent and survives that.
--
-- `categories` is the platform taxonomy (admin/service-role only),
-- `merchant_subscriptions` is Phase 7's money table, `support_*` are Phase 9's.
revoke insert, update, delete on
  public.categories, public.merchant_subscriptions,
  public.support_conversations, public.support_messages
from anon, authenticated;
--> statement-breakpoint

revoke insert, update, delete on public.favorite_products, public.favorite_vendors from anon;
--> statement-breakpoint

-- ── Deliberately left alone ────────────────────────────────────────────────
--
-- `favorite_products`, `favorite_vendors`, `vendor_categories`, `vendor_hours`
-- and `vendor_sections` keep full-table UPDATE for `authenticated`, and that is
-- correct: every column on them genuinely belongs to whoever owns the row, and
-- the one column that would matter — `vendor_id` — is already pinned by each
-- policy's WITH CHECK. Recorded here so the next audit does not re-litigate them.
select 1;
