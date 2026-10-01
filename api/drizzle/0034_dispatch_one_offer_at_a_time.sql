-- One live offer per courier.
--
-- Each dispatch tick walks every waiting order and asks this function for the
-- nearest eligible courier. Nothing excluded a courier who already had an offer
-- on screen, so the first courier to come online was handed every waiting order
-- in the same second. The app shows one offer at a time; the rest ran out
-- unseen — and since a courier is never re-offered an order they "saw", that
-- courier was then permanently skipped for all of them. Walked on 2026-09-30:
-- two couriers each received the same three orders at once, all six expired,
-- and those three orders had nobody left to go to.
--
-- `create or replace` keeps the function's existing grants (execute revoked from
-- anon/authenticated — see the rpc execute-grant audit).

create or replace function public.dispatch_next_courier(
  p_order_id uuid,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_stale_before timestamp with time zone,
  p_max_pickup_km double precision
)
returns table(id uuid, vehicle text, distance_to_pickup_km double precision)
language sql
stable
as $function$
  select c.id, c.vehicle::text, d.km
    from public.couriers c
    cross join lateral (
      select 6371 * 2 * asin(sqrt(
               power(sin(radians(p_pickup_lat - c.base_lat) / 2), 2)
             + cos(radians(c.base_lat)) * cos(radians(p_pickup_lat))
             * power(sin(radians(p_pickup_lng - c.base_lng) / 2), 2)
             )) as km
    ) d
   where c.status = 'approved'
     and c.is_online = true
     and c.last_seen_at is not null
     and c.last_seen_at >= p_stale_before
     -- Never already offered this order — the server-side form of the mock's
     -- `passedOrderIds`. Covers declined and expired alike.
     and not exists (
       select 1 from public.dispatch_offers o
        where o.order_id = p_order_id and o.courier_id = c.id
     )
     -- One offer at a time: a courier already looking at an offer is not handed
     -- a second one that would expire behind it.
     and not exists (
       select 1 from public.dispatch_offers o
        where o.courier_id = c.id and o.outcome is null and o.expires_at > now()
     )
     -- One run at a time. A courier mid-delivery arriving at a second pickup is
     -- how food gets cold in a bag.
     and not exists (
       select 1 from public.order_deliveries dd
        where dd.courier_id = c.id and dd.delivered_at is null
     )
     and d.km <= p_max_pickup_km
   -- Ranked by distance from the **shop**, not the shopper: the first thing
   -- that has to happen is someone reaching the counter.
   order by d.km asc
   limit 1;
$function$;
