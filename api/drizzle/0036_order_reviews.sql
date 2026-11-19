-- Ratings: what a shopper thought of the shop and of the courier, once per order.
--
-- `vendors.rating`, `vendors.review_count` and `couriers.rating` have existed
-- since the first migration and every screen shows them, but nothing could
-- write them: a real shop stayed at 0.0 (0) forever. This is the table those
-- three numbers are a summary of, and the function that keeps them true.
--
-- **One review per order, not per shop.** `order_id` is the primary key, so a
-- shopper who orders ten times may rate ten times, and nobody may rate a shop
-- they never bought from. That is the whole anti-abuse rule, and it is a
-- constraint rather than a check in a service.
--
-- `vendor_id` and `courier_id` are copied from the order instead of joined at
-- read time: the aggregate is recomputed on every submission, and it should be
-- one indexed scan of this table, not a join through `orders` and
-- `order_deliveries`.
--
-- The courier rating is optional. A shopper who has an opinion about the food
-- and none about the person at the door should not be made to invent one — and
-- an order can be delivered with no courier row at all (the seeded history).

create table public.order_reviews (
  order_id        uuid primary key references public.orders (id) on delete cascade,
  customer_id     uuid not null references public.profiles (id),
  vendor_id       uuid not null references public.vendors (id),
  courier_id      uuid references public.couriers (id),
  vendor_rating   smallint not null check (vendor_rating between 1 and 5),
  courier_rating  smallint check (courier_rating between 1 and 5),
  comment         text check (char_length(comment) between 1 and 1000),
  created_at      timestamptz not null default now(),
  -- A rating for a courier who did not carry the order is a rating of nobody.
  constraint order_reviews_courier_rating_has_courier
    check (courier_rating is null or courier_id is not null)
);
--> statement-breakpoint

-- The three foreign keys Postgres does not index for us. The first two are
-- also exactly what the aggregate below scans.
create index order_reviews_vendor_id_idx on public.order_reviews (vendor_id);
--> statement-breakpoint
create index order_reviews_courier_id_idx on public.order_reviews (courier_id) where courier_id is not null;
--> statement-breakpoint
create index order_reviews_customer_id_idx on public.order_reviews (customer_id);
--> statement-breakpoint

-- Service role only, like `push_tokens`: RLS on with no policies and the grants
-- revoked. Every read and write goes through the API, which decides who sees
-- which half of a review — a merchant has no business reading what a shopper
-- thought of the courier.
alter table public.order_reviews enable row level security;
--> statement-breakpoint
revoke all on table public.order_reviews from public, anon, authenticated;
--> statement-breakpoint
-- Supabase's default privileges already give `service_role` the table; stated
-- so this file does not depend on them when replayed somewhere else.
grant all on table public.order_reviews to service_role;
--> statement-breakpoint

-- Records one review and refreshes the two summaries, in one transaction.
--
-- A function rather than an insert followed by two updates from the API,
-- because PostgREST has no transaction to put them in: a review stored with a
-- stale average beside it is the state this exists to make impossible.
--
-- Refusals, as SQLSTATEs the API maps to a status:
--   SGB05  no such order for this shopper (not theirs and not there answer alike)
--   SGB09  the order has not been delivered
--   23505  already reviewed — the primary key's own unique violation
--
-- The summary is **recomputed from the reviews**, not nudged incrementally.
-- `rating` is `numeric(2,1)`: folding each new mark into a rounded average
-- would drift a little further from the truth with every review. The cost is
-- that a seeded shop's invented "4.7 (120)" is replaced by what its real
-- reviews say on the first one it receives — which is the honest number.
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

  -- No courier, no courier rating — dropped rather than refused, so an app that
  -- always sends both fields does not fail on an order nobody carried.
  v_courier_rating := case when v_courier_id is null then null else p_courier_rating end;

  -- Serialise reviews of the same shop (and the same courier). Without the
  -- lock, two concurrent submissions each compute an average that cannot see
  -- the other's uncommitted row, and whichever commits last writes a summary
  -- that is one review short. Always shop first, then courier: one order of
  -- locking, so two reviews can never wait on each other.
  perform 1 from public.vendors v where v.id = v_vendor_id for update;
  if v_courier_rating is not null then
    perform 1 from public.couriers c where c.id = v_courier_id for update;
  end if;

  insert into public.order_reviews
    (order_id, customer_id, vendor_id, courier_id, vendor_rating, courier_rating, comment)
  values
    (p_order_id, p_customer_id, v_vendor_id, v_courier_id, p_vendor_rating, v_courier_rating,
     nullif(btrim(p_comment), ''));

  update public.vendors v
     set rating = s.avg_rating,
         review_count = s.n
    from (
      select round(avg(r.vendor_rating), 1) as avg_rating, count(*)::integer as n
        from public.order_reviews r
       where r.vendor_id = v_vendor_id
    ) s
   where v.id = v_vendor_id;

  if v_courier_rating is not null then
    update public.couriers c
       set rating = s.avg_rating
      from (
        select round(avg(r.courier_rating), 1) as avg_rating
          from public.order_reviews r
         where r.courier_id = v_courier_id and r.courier_rating is not null
      ) s
     where c.id = v_courier_id;
  end if;
end;
$function$;
--> statement-breakpoint

-- PostgREST publishes every function in `public` as `POST /rpc/<name>`, and a
-- new function grants EXECUTE to PUBLIC — `anon` included. `p_customer_id` is
-- an argument here, so an anonymous caller could otherwise review any delivered
-- order as its owner. Verify by calling it as anon, not by reading this file.
revoke execute on function public.order_review_submit(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.order_review_submit(uuid, uuid, integer, integer, text) to service_role;
