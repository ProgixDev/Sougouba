-- The orders domain's own visibility rule: an order concerns three parties —
-- the shopper who placed it, the merchant filling it, and (from Phase 5) the
-- courier carrying it — and nobody else.
--
-- Same stance as the catalog's (`0008`): the API connects as the table owner
-- and is not gated by any of this. These policies exist for the mobile app's
-- own direct Supabase client and as the last line if an API guard is ever
-- wrong. Helpers live in `private` for the reason `0010` gives — created in
-- `public` they would be published as PostgREST RPC endpoints.
create or replace function private.owns_order_as_customer(o_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.id = o_id and o.customer_id = (select auth.uid()));
$$;
--> statement-breakpoint

create or replace function private.owns_order_as_merchant(o_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.id = o_id and v.owner_id = (select auth.uid())
  );
$$;
--> statement-breakpoint

grant execute on function private.owns_order_as_customer(uuid), private.owns_order_as_merchant(uuid) to authenticated;
--> statement-breakpoint

create policy "orders_select_own" on public.orders
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (select 1 from public.vendors v where v.id = orders.vendor_id and v.owner_id = (select auth.uid()))
  );
--> statement-breakpoint

create policy "order_items_select_own" on public.order_items
  for select to authenticated
  using (private.owns_order_as_customer(order_id) or private.owns_order_as_merchant(order_id));
--> statement-breakpoint

create policy "order_status_history_select_own" on public.order_status_history
  for select to authenticated
  using (private.owns_order_as_customer(order_id) or private.owns_order_as_merchant(order_id));
--> statement-breakpoint

create policy "disputes_select_own" on public.disputes
  for select to authenticated
  using (private.owns_order_as_customer(order_id) or private.owns_order_as_merchant(order_id));
--> statement-breakpoint

-- Every write in this domain moves money, stock, or a status other parties act
-- on, and each carries a server-side rule that a direct table write would skip:
-- Stripe verification before an order exists, the `STATUS_ACTOR` table on a
-- status change, one-dispute-per-order. So `authenticated` gets no write here
-- at all — unlike the catalog, where a merchant editing their own shopfront is
-- a coherent direct-write story.
revoke insert, update, delete on
  public.orders, public.order_items, public.order_status_history, public.disputes
from anon, authenticated;
--> statement-breakpoint

-- Nothing about an order is public: not its total, not its address, not the
-- fact it exists.
revoke select on public.orders, public.order_items, public.order_status_history, public.disputes from anon;
