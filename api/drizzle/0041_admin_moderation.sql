-- Back-office moderation: reviews, merchant coupons, products.
--
-- Three things the platform could not act on once merchants and customers
-- started writing them: a review comment (or a fake review), a merchant's promo
-- code, a product listing. Each action here writes its change and its audit
-- line in one transaction, like every other admin decision.

alter type public.audit_subject add value if not exists 'review';
--> statement-breakpoint
alter type public.audit_subject add value if not exists 'coupon';
--> statement-breakpoint
alter type public.audit_subject add value if not exists 'product';
--> statement-breakpoint

-- ── reviews ─────────────────────────────────────────────────────────────────
--
-- Two separate levers, because they answer different problems:
--   comment_hidden_at — the words are abusive; the stars still count.
--   removed_at        — the review itself is fake or abusive; it leaves the
--                       shop's and courier's averages.
-- Neither deletes: the row is the record, and undoing restores it exactly.
-- The order's primary key still holds, so a removed review is not replaced by
-- a second one from the same order.
alter table public.order_reviews
  add column comment_hidden_at timestamptz,
  add column removed_at timestamptz,
  add column moderation_reason text check (char_length(moderation_reason) <= 1000),
  add column moderated_by uuid references public.profiles (id);
--> statement-breakpoint

-- The averages, recomputed from the reviews that count. One place, called by
-- both the customer's submit and the admin's moderation, so the two can never
-- disagree about which reviews are in. A shop with none left reads 0.0 (0),
-- like a shop that was never reviewed.
create or replace function private.refresh_review_aggregates(p_vendor_id uuid, p_courier_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  update public.vendors v
     set rating = coalesce(s.avg_rating, 0),
         review_count = s.n
    from (
      select round(avg(r.vendor_rating), 1) as avg_rating, count(*)::integer as n
        from public.order_reviews r
       where r.vendor_id = p_vendor_id and r.removed_at is null
    ) s
   where v.id = p_vendor_id;

  if p_courier_id is not null then
    update public.couriers c
       set rating = coalesce(s.avg_rating, 0)
      from (
        select round(avg(r.courier_rating), 1) as avg_rating
          from public.order_reviews r
         where r.courier_id = p_courier_id and r.courier_rating is not null and r.removed_at is null
      ) s
     where c.id = p_courier_id;
  end if;
end;
$function$;
--> statement-breakpoint
revoke execute on function private.refresh_review_aggregates(uuid, uuid) from public, anon, authenticated;
--> statement-breakpoint

-- 0036's submit, unchanged in behaviour except that the averages now come from
-- the shared helper — and so leave removed reviews out.
create or replace function public.order_review_submit(
  p_customer_id uuid,
  p_order_id uuid,
  p_vendor_rating integer,
  p_courier_rating integer default null,
  p_comment text default null
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_vendor_id uuid;
  v_status public.order_status;
  v_courier_id uuid;
  v_courier_rating integer;
begin
  select o.vendor_id, o.status
    into v_vendor_id, v_status
    from public.orders o
   where o.id = p_order_id and o.customer_id = p_customer_id;

  if not found then
    raise exception 'Order not found' using errcode = 'SGB05';
  end if;
  if v_status <> 'delivered' then
    raise exception 'Only a delivered order can be reviewed' using errcode = 'SGB09';
  end if;

  select d.courier_id into v_courier_id
    from public.order_deliveries d
   where d.order_id = p_order_id;

  v_courier_rating := case when v_courier_id is null then null else p_courier_rating end;

  -- Shop first, then courier: one order of locking (see 0036).
  perform 1 from public.vendors v where v.id = v_vendor_id for update;
  if v_courier_rating is not null then
    perform 1 from public.couriers c where c.id = v_courier_id for update;
  end if;

  insert into public.order_reviews
    (order_id, customer_id, vendor_id, courier_id, vendor_rating, courier_rating, comment)
  values
    (p_order_id, p_customer_id, v_vendor_id, v_courier_id, p_vendor_rating, v_courier_rating,
     nullif(btrim(p_comment), ''));

  perform private.refresh_review_aggregates(
    v_vendor_id, case when v_courier_rating is null then null else v_courier_id end
  );
end;
$function$;
--> statement-breakpoint

-- Hide or show a review's comment, remove or restore the review. Refusals:
-- SGB05 no review for this order; 22023 an unknown action.
create or replace function public.admin_review_moderate(
  p_admin_id uuid,
  p_order_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_review public.order_reviews;
  v_label text;
  v_changes jsonb;
begin
  select * into v_review from public.order_reviews where order_id = p_order_id for update;
  if not found then
    raise exception 'Review not found' using errcode = 'SGB05';
  end if;

  -- Same locking order as submit: shop, then courier.
  perform 1 from public.vendors v where v.id = v_review.vendor_id for update;
  if v_review.courier_id is not null then
    perform 1 from public.couriers c where c.id = v_review.courier_id for update;
  end if;

  if p_action = 'hide_comment' then
    update public.order_reviews set comment_hidden_at = now() where order_id = p_order_id;
    v_changes := jsonb_build_object('comment_hidden', jsonb_build_object('from', v_review.comment_hidden_at is not null, 'to', true));
  elsif p_action = 'show_comment' then
    update public.order_reviews set comment_hidden_at = null where order_id = p_order_id;
    v_changes := jsonb_build_object('comment_hidden', jsonb_build_object('from', v_review.comment_hidden_at is not null, 'to', false));
  elsif p_action = 'remove' then
    update public.order_reviews set removed_at = now() where order_id = p_order_id;
    v_changes := jsonb_build_object('removed', jsonb_build_object('from', v_review.removed_at is not null, 'to', true));
  elsif p_action = 'restore' then
    update public.order_reviews set removed_at = null where order_id = p_order_id;
    v_changes := jsonb_build_object('removed', jsonb_build_object('from', v_review.removed_at is not null, 'to', false));
  else
    raise exception 'Unknown moderation action %', p_action using errcode = '22023';
  end if;

  update public.order_reviews
     set moderation_reason = nullif(btrim(p_reason), ''), moderated_by = p_admin_id
   where order_id = p_order_id;

  perform private.refresh_review_aggregates(v_review.vendor_id, v_review.courier_id);

  select name into v_label from public.vendors where id = v_review.vendor_id;
  perform private.admin_audit_write(
    p_admin_id, 'review.moderate', 'review'::public.audit_subject, p_order_id,
    coalesce(v_label, '') || ' — ' || v_review.vendor_rating || '/5', nullif(btrim(p_reason), ''), v_changes
  );
end;
$function$;
--> statement-breakpoint

-- ── coupons ─────────────────────────────────────────────────────────────────

-- Ends a merchant's promo code now — the same thing the merchant's own
-- "Désactiver" does (`ends_at = now()`), so every reader of "is it live"
-- already agrees. Refusals: SGB05 no such coupon; SGB06 already over.
create or replace function public.admin_coupon_deactivate(
  p_admin_id uuid,
  p_coupon_id uuid,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_coupon public.coupons;
  v_vendor text;
begin
  select * into v_coupon from public.coupons where id = p_coupon_id for update;
  if not found then
    raise exception 'Coupon not found' using errcode = 'SGB05';
  end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
    raise exception 'This code has already ended' using errcode = 'SGB06';
  end if;

  update public.coupons set ends_at = now() where id = p_coupon_id;

  select name into v_vendor from public.vendors where id = v_coupon.vendor_id;
  perform private.admin_audit_write(
    p_admin_id, 'coupon.deactivate', 'coupon'::public.audit_subject, p_coupon_id,
    v_coupon.code || coalesce(' — ' || v_vendor, ''), nullif(btrim(p_reason), ''),
    jsonb_build_object('ends_at', jsonb_build_object('from', v_coupon.ends_at, 'to', now()))
  );
end;
$function$;
--> statement-breakpoint

-- ── products ────────────────────────────────────────────────────────────────

-- Hidden by the back office: out of the catalogue, search, product pages,
-- carts, checkout and best sellers. Not `is_available`: that is the merchant's
-- own switch, and a merchant could flip it straight back.
alter table public.products
  add column hidden_at timestamptz,
  add column hidden_reason text check (char_length(hidden_reason) <= 1000),
  add column hidden_by uuid references public.profiles (id);
--> statement-breakpoint

-- Hide (the API requires a reason) or show again. Refusals: SGB05 no such
-- product; SGB06 already in that state.
create or replace function public.admin_product_set_hidden(
  p_admin_id uuid,
  p_product_id uuid,
  p_hidden boolean,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_product public.products;
  v_vendor text;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = 'SGB05';
  end if;
  if (v_product.hidden_at is not null) = p_hidden then
    raise exception 'The product is already in that state' using errcode = 'SGB06';
  end if;

  update public.products
     set hidden_at = case when p_hidden then now() end,
         hidden_reason = case when p_hidden then nullif(btrim(p_reason), '') end,
         hidden_by = case when p_hidden then p_admin_id end,
         updated_at = now()
   where id = p_product_id;

  select name into v_vendor from public.vendors where id = v_product.vendor_id;
  perform private.admin_audit_write(
    p_admin_id, case when p_hidden then 'product.hide' else 'product.unhide' end,
    'product'::public.audit_subject, p_product_id,
    v_product.name || coalesce(' — ' || v_vendor, ''), nullif(btrim(p_reason), ''),
    jsonb_build_object('hidden', jsonb_build_object('from', not p_hidden, 'to', p_hidden))
  );
end;
$function$;
--> statement-breakpoint

-- The catalogue read, now saved in the repo (it was created outside it): the
-- shopper's view (p_approved_only) leaves hidden products out, and every row
-- says whether it is hidden so the merchant's own listing can show it.
create or replace function public.product_page(p_vendor_id uuid DEFAULT NULL::uuid, p_approved_only boolean DEFAULT true, p_q text DEFAULT NULL::text, p_section_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_on_sale boolean DEFAULT false, p_in_stock_only boolean DEFAULT false, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 language plpgsql
 stable
 set search_path = ''
as $function$
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
                          -- `relevance` keeps the catalogue's own order rather
                          -- than imposing one, matching the mobile default.
                          case when p_sort not in ('price_asc','price_desc','name') then m.created_at end asc,
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

-- 0037's best sellers, leaving hidden products out.
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
     and p.hidden_at is null
     and v.status = 'approved'
   group by i.product_id
   order by qty desc, i.product_id
   limit least(greatest(p_limit, 1), 50);
$function$;
--> statement-breakpoint

-- Service role only, every one of them.
revoke execute on function public.admin_review_moderate(uuid, uuid, text, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_review_moderate(uuid, uuid, text, text) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_coupon_deactivate(uuid, uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_coupon_deactivate(uuid, uuid, text) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_product_set_hidden(uuid, uuid, boolean, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_product_set_hidden(uuid, uuid, boolean, text) to service_role;
--> statement-breakpoint
revoke execute on function public.product_page(uuid, boolean, text, uuid, uuid, numeric, numeric, boolean, boolean, text, integer, integer)
  from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.product_page(uuid, boolean, text, uuid, uuid, numeric, numeric, boolean, boolean, text, integer, integer)
  to service_role;
