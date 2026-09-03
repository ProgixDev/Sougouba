create or replace function private.is_courier(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.couriers c where c.id = c_id and c.user_id = (select auth.uid()));
$$;
--> statement-breakpoint

grant execute on function private.is_courier(uuid) to authenticated;
--> statement-breakpoint

-- A courier reads their own file. Their name, photo and rating reach a shopper
-- through the order's tracking payload, which the API assembles — not by
-- opening this table up to everyone who can see an order.
create policy "couriers_select_own" on public.couriers
  for select to authenticated using (user_id = (select auth.uid()));
--> statement-breakpoint

create policy "courier_insurance_select_own" on public.courier_insurance
  for select to authenticated using (private.is_courier(courier_id));
--> statement-breakpoint

-- Offers are the one table the courier app subscribes to directly: an offer has
-- to arrive as a push, not as the result of a poll, or a courier learns about a
-- 30-second window five seconds late. Read-only — accepting and declining are
-- endpoints, because each is a compare-and-swap with consequences.
create policy "dispatch_offers_select_own" on public.dispatch_offers
  for select to authenticated using (private.is_courier(courier_id));
--> statement-breakpoint

-- Location pings: the courier who wrote them, and the shopper waiting on that
-- order. The shopper's tracking map subscribes here, which is what replaces the
-- mock's client-side position simulation.
create policy "courier_locations_select_involved" on public.courier_locations
  for select to authenticated
  using (private.is_courier(courier_id) or private.owns_order_as_customer(order_id));
--> statement-breakpoint

create policy "order_deliveries_select_involved" on public.order_deliveries
  for select to authenticated
  using (
    private.is_courier(courier_id)
    or private.owns_order_as_customer(order_id)
    or private.owns_order_as_merchant(order_id)
  );
--> statement-breakpoint

-- Proof of delivery is evidence in a dispute: visible to the parties, writable
-- by none of them directly.
create policy "delivery_proofs_select_involved" on public.delivery_proofs
  for select to authenticated
  using (private.owns_order_as_customer(order_id) or private.owns_order_as_merchant(order_id));
--> statement-breakpoint

-- Every write in this domain is a compare-and-swap (accepting a run), a payout
-- figure, or evidence. None is safe as a direct table write — a courier who
-- could `update order_deliveries set earnings_cad = …` is a courier who sets
-- their own pay.
revoke insert, update, delete on
  public.couriers, public.courier_insurance, public.courier_payouts,
  public.courier_locations, public.dispatch_offers, public.order_deliveries, public.delivery_proofs
from anon, authenticated;
--> statement-breakpoint

revoke select on
  public.couriers, public.courier_insurance, public.courier_payouts,
  public.courier_locations, public.dispatch_offers, public.order_deliveries, public.delivery_proofs
from anon;
--> statement-breakpoint

-- Realtime on the two tables the apps subscribe to. This is what replaces the
-- mock's client-side polling loop (`hooks/useDispatchEngine.ts`) and its
-- pure-function position simulation (`lib/courierRoute.ts`) — both of which
-- get deleted from the app rather than ported.
alter publication supabase_realtime add table public.dispatch_offers;
--> statement-breakpoint

alter publication supabase_realtime add table public.courier_locations;
