-- Paginating the mobile app from the database (four parts below).
--
-- 1. `vendor_order_summary` — the merchant orders tab's chip counts.
-- 2. `vendor_page_nearest` — shop lists sorted open-first, then nearest.
-- 3. `product_page` gains `section` and `stock_asc` sorts and a stock ceiling.
-- 4. `customer_order_stats` — the shopper's profile figures.
--> statement-breakpoint

-- The merchant's order chips, counted where the orders are.
--
-- The app's orders tab loaded the shop's latest 100 orders and counted its
-- chips ("En cours (3)", "Litiges (1)", "Livrées (88)") and the amount beside
-- them from that page — wrong for any shop past 100 orders. Paginated from
-- the database, the page no longer holds the answer, so this returns each
-- chip's count and amount in one call.
--
-- `amountCad` is what the visible list adds up to: every order in that view
-- except cancelled ones. The disputes chip counts only disputes still waiting
-- on the merchant (`open`), while its amount covers every disputed order the
-- view lists — the same rules the screen applied on the client.
create or replace function public.vendor_order_summary(p_vendor_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'active', jsonb_build_object(
      'count',     count(*) filter (where o.status not in ('delivered', 'cancelled')),
      'amountCad', coalesce(sum(o.total_cad) filter (where o.status not in ('delivered', 'cancelled')), 0)::float8),
    'disputes', jsonb_build_object(
      'count',     count(*) filter (where d.status = 'open'),
      'amountCad', coalesce(sum(o.total_cad) filter (where d.order_id is not null and o.status <> 'cancelled'), 0)::float8),
    'delivered', jsonb_build_object(
      'count',     count(*) filter (where o.status = 'delivered'),
      'amountCad', coalesce(sum(o.total_cad) filter (where o.status = 'delivered'), 0)::float8),
    'cancelled', jsonb_build_object(
      'count',     count(*) filter (where o.status = 'cancelled'),
      'amountCad', 0::float8),
    'all', jsonb_build_object(
      'count',     count(*),
      'amountCad', coalesce(sum(o.total_cad) filter (where o.status <> 'cancelled'), 0)::float8)
  )
  from public.orders o
  left join public.disputes d on d.order_id = o.id
  where o.vendor_id = p_vendor_id;
$function$;
--> statement-breakpoint

revoke execute on function public.vendor_order_summary(uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.vendor_order_summary(uuid) to service_role;
--> statement-breakpoint

-- Shops nearest the shopper, one page at a time.
--
-- The vertical screens fetched 100 shops and sorted them by distance on the
-- phone, so the 101st shop never appeared however close it was. Distance is
-- computed from the shopper's delivery point (haversine, km — the same formula
-- as `lib/geo.ts`), and only the ids of the page come back: the API hydrates
-- them through the same projection every other shop list uses.
--
-- Open shops first, then nearest; shops without coordinates last; name and id
-- break ties so pages never repeat or skip a shop.
create or replace function public.vendor_page_nearest(
  p_lat double precision,
  p_lng double precision,
  p_type text default null,
  p_halal boolean default null,
  p_max_eta integer default null,
  p_open_now boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with matched as (
    select v.id, v.name, public.is_open(v) as open_now,
           case when v.address_lat is null or v.address_lng is null then null
                else 2 * 6371 * asin(sqrt(
                       power(sin(radians(v.address_lat - p_lat) / 2), 2)
                       + cos(radians(p_lat)) * cos(radians(v.address_lat))
                         * power(sin(radians(v.address_lng - p_lng) / 2), 2)))
           end as km
      from public.vendors v
     where v.status = 'approved'
       and (p_type is null or v.vendor_type::text = p_type)
       and (p_halal is not true or v.is_halal_certified)
       and (p_max_eta is null or v.delivery_eta_min <= p_max_eta)
  ),
  filtered as (
    select * from matched where p_open_now is null or open_now = p_open_now
  )
  select jsonb_build_object(
    'ids', coalesce((
      select jsonb_agg(id order by rn)
        from (select id, row_number() over (order by open_now desc, km asc nulls last, name, id) as rn
                from filtered) ranked
       where rn > p_offset and rn <= p_offset + p_limit), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$function$;
--> statement-breakpoint

revoke execute on function public.vendor_page_nearest(double precision, double precision, text, boolean, integer, boolean, integer, integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.vendor_page_nearest(double precision, double precision, text, boolean, integer, boolean, integer, integer) to service_role;
--> statement-breakpoint

-- Product lists that scroll in pages, for the shop page and the merchant.
--
-- * `section` sort: the shop screen groups products under the merchant's
--   sections. Loaded in pages, they have to arrive in section order, or a
--   section would reappear further down as each page brings more of it.
-- * `stock_asc` sort and `p_max_stock`: the merchant's "à réapprovisionner"
--   count and lowest-stock list were computed from the first 100 products on
--   the phone. `p_max_stock` keeps available products at or under that stock.
--
-- A new parameter changes the signature, so the old one is dropped first —
-- two overloads would make PostgREST's named-argument call ambiguous. The rest
-- of the function is unchanged from 0041, and so are its grants.
drop function if exists public.product_page(uuid, boolean, text, uuid, uuid, numeric, numeric, boolean, boolean, text, integer, integer);
--> statement-breakpoint

create function public.product_page(p_vendor_id uuid DEFAULT NULL::uuid, p_approved_only boolean DEFAULT true, p_q text DEFAULT NULL::text, p_section_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_on_sale boolean DEFAULT false, p_in_stock_only boolean DEFAULT false, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_max_stock integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_items jsonb;
  v_total integer;
begin
  with matched as (
    select p.*
      from public.products p
     where (p_vendor_id is null or p.vendor_id = p_vendor_id)
       and (not p_approved_only
            or exists (select 1 from public.vendors v where v.id = p.vendor_id and v.status = 'approved'))
       -- Hidden by the back office: gone from every shopper read, still listed
       -- for the merchant (who calls with p_approved_only = false).
       and (not p_approved_only or p.hidden_at is null)
       and (p_section_id  is null or p.section_id  = p_section_id)
       and (p_category_id is null or p.category_id = p_category_id)
       and (p_price_min   is null or p.price_cad >= p_price_min)
       and (p_price_max   is null or p.price_cad <  p_price_max)
       and (not p_on_sale       or p.compare_at_price_cad is not null)
       and (not p_in_stock_only or (p.is_available = true and p.stock_qty > 0))
       and (p_max_stock is null or (p.is_available = true and p.stock_qty <= p_max_stock))
       and (p_q is null
            or p.name ilike p_q
            -- Name or any one tag — the same test `searchProducts` makes, with
            -- the array membership pushed into Postgres rather than a `.some()`
            -- per row.
            or exists (select 1 from unnest(p.tags) tag where tag ilike p_q))
  )
  select
    coalesce((select jsonb_agg(
               jsonb_build_object(
                 'id', id, 'vendorId', vendor_id, 'categoryId', category_id, 'sectionId', section_id,
                 'name', name, 'description', description,
                 'priceCad', price_cad, 'compareAtPriceCad', compare_at_price_cad,
                 'imageUrl', image_url, 'stockQty', stock_qty, 'isAvailable', is_available, 'tags', tags,
                 'nutritionCalories', nutrition_calories, 'nutritionProteinG', nutrition_protein_g,
                 'nutritionFatG', nutrition_fat_g, 'nutritionWeightG', nutrition_weight_g,
                 'hiddenAt', hidden_at, 'hiddenReason', hidden_reason
               ) order by rn)
             from (
               select m.*,
                      row_number() over (
                        order by
                          -- `id` is the tiebreak in every branch: without a
                          -- unique one, page 2 can overlap page 1.
                          case when p_sort = 'price_asc'  then m.price_cad end asc,
                          case when p_sort = 'price_desc' then m.price_cad end desc,
                          case when p_sort = 'name'       then m.name collate "fr-CA-x-icu" end asc,
                          -- A shop page, grouped by its own sections: the shop's
                          -- section order, products without one last.
                          case when p_sort = 'stock_asc'  then m.stock_qty end asc,
                          case when p_sort = 'section' then (select s.position from public.vendor_sections s where s.id = m.section_id) end asc nulls last,
                          -- `relevance` keeps the catalogue's own order rather
                          -- than imposing one, matching the mobile default.
                          case when p_sort not in ('price_asc','price_desc','name','stock_asc') then m.created_at end asc,
                          m.id asc
                      ) as rn
                 from matched m
             ) ordered
            where rn > p_offset and rn <= p_offset + p_limit),
            '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;
--> statement-breakpoint

revoke execute on function public.product_page(uuid, boolean, text, uuid, uuid, numeric, numeric, boolean, boolean, text, integer, integer, integer)
  from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.product_page(uuid, boolean, text, uuid, uuid, numeric, numeric, boolean, boolean, text, integer, integer, integer)
  to service_role;
--> statement-breakpoint

-- 4. The shopper's profile figures — orders placed and money spent — summed
-- over every order, not over the latest 100 the profile used to load.
-- Cancelled orders count for neither, as before.
create or replace function public.customer_order_stats(p_customer_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'orderCount', count(*) filter (where status <> 'cancelled'),
    'spentCad',   coalesce(sum(total_cad) filter (where status <> 'cancelled'), 0)::float8
  )
  from public.orders
  where customer_id = p_customer_id;
$function$;
--> statement-breakpoint

revoke execute on function public.customer_order_stats(uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.customer_order_stats(uuid) to service_role;
