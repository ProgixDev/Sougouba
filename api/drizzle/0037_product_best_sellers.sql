-- Best sellers across the whole platform, for the customer home screen.
--
-- The home screen's "Articles les + vendus" had nothing behind it: the only
-- sales ranking was `merchant_analytics`, per shop and behind the merchant's
-- token, so the rail fell back to "on sale first". This is the same count —
-- units on every order that was not cancelled, from `order_items` — taken over
-- every shop.
--
-- Only what a shopper could buy right now is ranked: an approved shop, a
-- product still on sale and in stock. A best seller the customer cannot add to
-- the cart is a dead tile, and the home screen would drop it anyway, leaving
-- the rail one short.
--
-- A rolling window rather than all-time, so the rail follows what is selling
-- now instead of crowning whatever the first month sold forever.
create or replace function public.product_best_sellers(p_limit integer default 6, p_days integer default 30)
returns table (product_id uuid, qty integer)
language sql
stable
set search_path = ''
as $function$
  select i.product_id, sum(i.qty)::integer as qty
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.products p on p.id = i.product_id
    join public.vendors v on v.id = p.vendor_id
   where o.status <> 'cancelled'
     and o.created_at >= now() - make_interval(days => greatest(p_days, 1))
     and p.is_available
     and p.stock_qty > 0
     and v.status = 'approved'
   group by i.product_id
   -- The id breaks ties, so two equal sellers do not swap places between calls.
   order by qty desc, i.product_id
   limit least(greatest(p_limit, 1), 50);
$function$;
--> statement-breakpoint

-- Called by the API with the service role, like the other functions it uses. The
-- ranking is public information (it is on the home screen), but a function in
-- `public` is otherwise callable by anyone through PostgREST, and the API is
-- the one place that decides what is exposed.
revoke execute on function public.product_best_sellers(integer, integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.product_best_sellers(integer, integer) to service_role;
