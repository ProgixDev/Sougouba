-- Delivery instructions: apartment and floor, door code, a note for the
-- courier, and whether to hand the bag over or leave it at the door.
--
-- Kept on the saved address, because they describe the place and are the same
-- every time, and copied onto the order when it is placed — the same snapshot
-- rule as the address itself: editing an address must not rewrite where, or
-- how, a past order was delivered.

alter table public.addresses
  add column unit          text check (char_length(unit) <= 60),
  add column door_code     text check (char_length(door_code) <= 30),
  add column delivery_notes text check (char_length(delivery_notes) <= 300),
  add column dropoff       text not null default 'hand' check (dropoff in ('hand', 'door'));
--> statement-breakpoint

alter table public.orders
  add column delivery_unit      text check (char_length(delivery_unit) <= 60),
  add column delivery_door_code text check (char_length(delivery_door_code) <= 30),
  add column delivery_notes     text check (char_length(delivery_notes) <= 300),
  add column delivery_dropoff   text not null default 'hand' check (delivery_dropoff in ('hand', 'door'));
--> statement-breakpoint

-- `order_place` gains the instructions. Same body otherwise; dropped first
-- because a new parameter is a new signature, and two overloads would leave
-- PostgREST unable to pick one.
drop function if exists public.order_place(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, double precision, double precision,
  jsonb, text, integer, numeric, text, numeric
);
--> statement-breakpoint

create function public.order_place(
  p_customer_id uuid,
  p_customer_name text,
  p_vendor_id uuid,
  p_subtotal_cad numeric,
  p_gst_cad numeric,
  p_qst_cad numeric,
  p_delivery_fee_cad numeric,
  p_total_cad numeric,
  p_addr_label text,
  p_addr_street text,
  p_addr_city text,
  p_addr_postal_code text,
  p_addr_lat double precision,
  p_addr_lng double precision,
  p_items jsonb,
  p_payment_intent_id text default null,
  p_points_redeemed integer default null,
  p_points_discount_cad numeric default null,
  p_coupon_code text default null,
  p_coupon_discount_cad numeric default null,
  p_delivery_unit text default null,
  p_delivery_door_code text default null,
  p_delivery_notes text default null,
  p_delivery_dropoff text default 'hand'
)
returns uuid
language plpgsql
as $function$
declare
  v_now       timestamptz := now();
  v_order_id  uuid;
  v_item      jsonb;
  v_updated   integer;
  v_coupon_id uuid;
  v_inserted  integer;
begin
  insert into public.orders (
    customer_id, customer_name, vendor_id, status,
    subtotal_cad, gst_cad, qst_cad, delivery_fee_cad, total_cad,
    points_redeemed, points_discount_cad, coupon_code, coupon_discount_cad,
    delivery_address_label, delivery_address_street, delivery_address_city,
    delivery_address_postal_code, delivery_address_lat, delivery_address_lng,
    delivery_unit, delivery_door_code, delivery_notes, delivery_dropoff,
    stripe_payment_intent_id, created_at
  ) values (
    p_customer_id, p_customer_name, p_vendor_id, 'pending',
    p_subtotal_cad, p_gst_cad, p_qst_cad, p_delivery_fee_cad, p_total_cad,
    p_points_redeemed, p_points_discount_cad, p_coupon_code, p_coupon_discount_cad,
    p_addr_label, p_addr_street, p_addr_city,
    p_addr_postal_code, p_addr_lat, p_addr_lng,
    nullif(btrim(p_delivery_unit), ''), nullif(btrim(p_delivery_door_code), ''),
    nullif(btrim(p_delivery_notes), ''), coalesce(p_delivery_dropoff, 'hand'),
    p_payment_intent_id, v_now
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, name, qty, unit_price_cad)
  select v_order_id,
         (e ->> 'productId')::uuid,
         e ->> 'name',
         (e ->> 'qty')::integer,
         (e ->> 'unitPriceCad')::numeric
    from jsonb_array_elements(p_items) as e;

  insert into public.order_status_history (order_id, status, at)
  values (v_order_id, 'pending', v_now);

  -- Stock comes down in the same transaction as the order, guarded so two
  -- simultaneous checkouts cannot both take the last unit: the predicate
  -- re-reads the quantity the row actually has right now, and a zero-row
  -- update means somebody else got there first.
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.products
       set stock_qty = stock_qty - (v_item ->> 'qty')::integer,
           updated_at = v_now
     where id = (v_item ->> 'productId')::uuid
       and stock_qty >= (v_item ->> 'qty')::integer;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception using
        errcode = 'SGB01',
        message = format('"%s" sold out while you were paying — you have not been charged for an order', v_item ->> 'name');
    end if;
  end loop;

  -- No expiry on a debit — see `LoyaltyService.balance`.
  if coalesce(p_points_redeemed, 0) > 0 then
    insert into public.loyalty_transactions (customer_id, points, reason, order_id, expires_at)
    values (p_customer_id, -p_points_redeemed, 'redeemed', v_order_id, null)
    on conflict do nothing;
  end if;

  if p_coupon_code is not null then
    -- The claim on the usage limit, and the only thing that actually holds
    -- it: a single UPDATE whose predicate reads the column it increments.
    update public.coupons c
       set used_count = c.used_count + 1
     where upper(c.code) = upper(btrim(p_coupon_code))
       and (c.usage_limit is null or c.used_count < c.usage_limit)
    returning c.id into v_coupon_id;

    if v_coupon_id is null then
      raise exception using errcode = 'SGB02', message = 'Ce code promo a atteint sa limite';
    end if;

    insert into public.coupon_redemptions (coupon_id, customer_id, order_id)
    values (v_coupon_id, p_customer_id, v_order_id)
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      raise exception using errcode = 'SGB03', message = 'Ce code promo a déjà été utilisé sur cette commande';
    end if;
  end if;

  return v_order_id;
end;
$function$;
--> statement-breakpoint

revoke all on function public.order_place(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, double precision, double precision,
  jsonb, text, integer, numeric, text, numeric, text, text, text, text
) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.order_place(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, double precision, double precision,
  jsonb, text, integer, numeric, text, numeric, text, text, text, text
) to service_role;
