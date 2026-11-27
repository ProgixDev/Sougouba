-- Paying the shops.
--
-- The cahier des charges (module 04) promises « paiements multi-vendeurs et
-- gestion des reversements », and the addendum (§05) a commission « déduite »
-- from what the shop is paid. The card payments were taken, the commission was
-- written down on each order — and no shop was ever paid: no screen let one
-- connect a Stripe account, and the only code that could send a shop money did
-- it at the moment of payment, before anything was delivered.
--
-- This is the other way round, the way couriers are already paid (0048): the
-- shopper pays Sougouba, the order is delivered, and once a week each shop
-- receives one transfer for everything delivered since the last, less the
-- commission. Paying after delivery means a cancelled order never has to be
-- taken back from a shop; paying by transfer means a shop can be owed more
-- than the shopper paid, which is what happens when Sougouba honours loyalty
-- points (`api/src/billing/split.ts` is the rule).
--
-- ── What is stored, and why here ────────────────────────────────────────────
--
-- `order_settlements` holds the shop's side of each order: its share, fixed
-- when the order is placed, and the part of any refund that is its to bear. A
-- table of its own rather than more columns on `orders`: every column of
-- `orders` is readable by the shopper who placed it (and by the shop), and
-- what Sougouba keeps on an order is not the shopper's business.
--
-- A settlement with no `payout_id` has not been paid. A weekly run *claims* a
-- shop's unpaid, delivered settlements into a `merchant_payouts` row, in one
-- transaction; only then is the Stripe transfer made, under an idempotency key
-- that is the payout's own id. So the set of orders a transfer pays for is
-- fixed before any money moves, an order delivered during the run waits for
-- the next one instead of being stamped paid without being counted, and a run
-- that dies between the claim and the transfer can be retried without paying
-- twice.

create table public.merchant_payouts (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references public.vendors (id) on delete restrict,
  -- Zero only between the two halves of `merchant_payout_claim`.
  amount_cad         numeric(12, 2) not null default 0 check (amount_cad >= 0),
  order_count        integer not null default 0,
  -- What earlier refunds took off this payment (zero or negative).
  adjustments_cad    numeric(12, 2) not null default 0,
  status             text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  trigger            text not null check (trigger in ('schedule', 'admin')),
  actor_id           uuid references public.profiles (id) on delete set null,
  -- `stripe_error`: Stripe refused, the orders went back to the pool.
  -- `record_error`: the transfer may have gone and the record did not follow;
  --   the orders stay claimed until a person has looked.
  reason             text check (reason in ('stripe_error', 'record_error')),
  error              text,
  stripe_transfer_id text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
--> statement-breakpoint

-- One open claim per shop: a second run finds the first's and resumes it.
create unique index merchant_payouts_one_pending on public.merchant_payouts (vendor_id) where status = 'pending';
--> statement-breakpoint
create index merchant_payouts_vendor_idx on public.merchant_payouts (vendor_id, created_at desc);
--> statement-breakpoint
create index merchant_payouts_status_idx on public.merchant_payouts (status, created_at desc);
--> statement-breakpoint

create table public.order_settlements (
  order_id   uuid primary key references public.orders (id) on delete cascade,
  vendor_id  uuid not null references public.vendors (id) on delete restrict,
  -- What the shop is owed for this order once delivered (`splitOrder`).
  share_cad  numeric(10, 2) not null,
  -- The shop's part of a refund given before the order was paid out.
  refund_cad numeric(10, 2) not null default 0 check (refund_cad >= 0),
  payout_id  uuid references public.merchant_payouts (id) on delete set null,
  created_at timestamptz not null default now()
);
--> statement-breakpoint

-- What a claim reads: one shop's settlements not yet in a payout.
create index order_settlements_unpaid_idx on public.order_settlements (vendor_id) where payout_id is null;
--> statement-breakpoint
create index order_settlements_payout_idx on public.order_settlements (payout_id) where payout_id is not null;
--> statement-breakpoint

-- A refund on an order the shop was already paid for: owed back by the shop,
-- taken off its next payment. Negative amounts.
create table public.merchant_adjustments (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors (id) on delete restrict,
  order_id   uuid references public.orders (id) on delete set null,
  amount_cad numeric(10, 2) not null check (amount_cad < 0),
  reason     text not null check (reason in ('refund_after_payout')),
  payout_id  uuid references public.merchant_payouts (id) on delete set null,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index merchant_adjustments_unsettled_idx on public.merchant_adjustments (vendor_id) where payout_id is null;
--> statement-breakpoint

-- The API's only. Nothing here is for a shopper's or a shop's own token — a
-- shop reads its payments through the API, which knows whose they are.
alter table public.merchant_payouts enable row level security;
--> statement-breakpoint
alter table public.order_settlements enable row level security;
--> statement-breakpoint
alter table public.merchant_adjustments enable row level security;
--> statement-breakpoint
revoke all on table public.merchant_payouts, public.order_settlements, public.merchant_adjustments from public, anon, authenticated;
--> statement-breakpoint
grant all on table public.merchant_payouts, public.order_settlements, public.merchant_adjustments to service_role;
--> statement-breakpoint

-- Paid orders that have no settlement yet, with the figures the API needs to
-- work out the shop's share. The share is written when an order is placed, but
-- that write is best-effort (the order itself must never fail over it), and
-- orders placed before this migration have none. The payout run asks for
-- these first and fills them in, so the rule stays in one place — the API's
-- `splitOrder` — rather than being repeated here in SQL.
create function public.orders_missing_settlement(p_limit integer default 500)
returns table (
  id uuid, vendor_id uuid, subtotal_cad numeric, gst_cad numeric, qst_cad numeric, delivery_fee_cad numeric,
  total_cad numeric, coupon_discount_cad numeric, points_discount_cad numeric, commission_cad numeric,
  refund_amount_cad numeric, refunded_at timestamptz, status text
)
language sql
stable
set search_path = ''
as $function$
  select o.id, o.vendor_id, o.subtotal_cad, o.gst_cad, o.qst_cad, o.delivery_fee_cad,
         o.total_cad, o.coupon_discount_cad, o.points_discount_cad, o.commission_cad,
         o.refund_amount_cad, o.refunded_at, o.status::text
    from public.orders o
   -- Only orders a card actually paid for. Seeded history moved no money.
   where o.stripe_payment_intent_id is not null
     and o.status <> 'cancelled'
     and not exists (select 1 from public.order_settlements s where s.order_id = o.id)
   order by o.created_at, o.id
   limit least(greatest(p_limit, 1), 1000);
$function$;
--> statement-breakpoint
revoke execute on function public.orders_missing_settlement(integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.orders_missing_settlement(integer) to service_role;
--> statement-breakpoint

-- What each shop is owed and has not been paid: delivered orders not yet in a
-- payout, less any refund still to take off. One row per shop with something
-- on either side; `p_vendor_id` narrows it to one shop, for the merchant's own
-- screen.
--
-- `p_from` is where paying starts (`MERCHANT_PAYOUTS_FROM`). Orders delivered
-- before it are not counted: on the day real payments begin, the database
-- still holds everything delivered while Stripe was in test mode, and none of
-- that is owed in real money.
create function public.merchant_payouts_owed(p_from timestamptz, p_vendor_id uuid default null)
returns table (
  vendor_id uuid, vendor_name text, pending_cad numeric, order_count integer, adjustments_cad numeric,
  oldest_at timestamptz, account_id text
)
language sql
stable
set search_path = ''
as $function$
  with due as (
    select s.vendor_id,
           sum(s.share_cad - s.refund_cad) as total,
           count(*)::int                   as orders,
           min(d.at)                       as oldest_at
      from public.order_settlements s
      join public.orders o on o.id = s.order_id
      join lateral (
        select min(h.at) as at from public.order_status_history h where h.order_id = o.id and h.status = 'delivered'
      ) d on true
     where s.payout_id is null
       and o.status = 'delivered'
       and d.at >= p_from
       and (p_vendor_id is null or s.vendor_id = p_vendor_id)
     group by s.vendor_id
  ),
  adjusted as (
    select a.vendor_id, sum(a.amount_cad) as total
      from public.merchant_adjustments a
     where a.payout_id is null
       and (p_vendor_id is null or a.vendor_id = p_vendor_id)
     group by a.vendor_id
  )
  select v.id, v.name,
         coalesce(d.total, 0) + coalesce(a.total, 0),
         coalesce(d.orders, 0),
         coalesce(a.total, 0),
         d.oldest_at,
         m.stripe_connect_account_id
    from public.vendors v
    left join due d on d.vendor_id = v.id
    left join adjusted a on a.vendor_id = v.id
    left join public.merchant_subscriptions m on m.vendor_id = v.id
   where (d.vendor_id is not null or a.vendor_id is not null)
     and (p_vendor_id is null or v.id = p_vendor_id)
   order by 3 desc, v.id;
$function$;
--> statement-breakpoint
revoke execute on function public.merchant_payouts_owed(timestamptz, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.merchant_payouts_owed(timestamptz, uuid) to service_role;
--> statement-breakpoint

-- Reserve everything a shop is owed into one payout, before any money moves.
--
-- Returns the payout to pay. If the shop already has one open — a run that
-- claimed and never finished — that one comes back with `resumed = true`, and
-- nothing new is claimed: the caller decides whether it is recent enough to
-- retry under the same idempotency key.
--
-- Nothing is returned, and nothing is written, when the shop is owed nothing
-- or owes more in refunds than it has earned: a negative balance waits for
-- next week's orders rather than becoming a payout of zero.
--
-- The lock on the shop's row is what makes the three writes one decision: a
-- refund landing mid-claim (`order_settlement_refund` takes the same lock)
-- either gets in before the orders are stamped or becomes an adjustment after.
create function public.merchant_payout_claim(
  p_vendor_id uuid,
  p_from timestamptz,
  p_trigger text,
  p_actor_id uuid default null
)
returns table (payout_id uuid, amount_cad numeric, order_count integer, resumed boolean, claimed_at timestamptz)
language plpgsql
set search_path = ''
as $function$
declare
  v_open public.merchant_payouts;
  v_id uuid;
  v_orders numeric;
  v_count integer;
  v_adjustments numeric;
begin
  perform 1 from public.vendors v where v.id = p_vendor_id for update;
  if not found then
    raise exception 'Shop not found' using errcode = 'SGB05';
  end if;

  select * into v_open from public.merchant_payouts p where p.vendor_id = p_vendor_id and p.status = 'pending';
  if found then
    return query select v_open.id, v_open.amount_cad, v_open.order_count, true, v_open.created_at;
    return;
  end if;

  -- The payout first, so the orders have something to point at; its amount is
  -- whatever ends up stamped, read back rather than computed beforehand.
  insert into public.merchant_payouts (vendor_id, trigger, actor_id)
  values (p_vendor_id, p_trigger, p_actor_id)
  returning id into v_id;

  update public.order_settlements s
     set payout_id = v_id
    from public.orders o
   where o.id = s.order_id
     and s.vendor_id = p_vendor_id
     and s.payout_id is null
     and o.status = 'delivered'
     and exists (
       select 1 from public.order_status_history h
        where h.order_id = o.id and h.status = 'delivered' and h.at >= p_from
     );

  update public.merchant_adjustments a
     set payout_id = v_id
   where a.vendor_id = p_vendor_id and a.payout_id is null;

  select coalesce(sum(s.share_cad - s.refund_cad), 0), count(*)::int
    into v_orders, v_count
    from public.order_settlements s where s.payout_id = v_id;
  select coalesce(sum(a.amount_cad), 0) into v_adjustments
    from public.merchant_adjustments a where a.payout_id = v_id;

  if v_orders + v_adjustments <= 0 then
    -- Nothing to pay: put everything back exactly as it was.
    update public.order_settlements s set payout_id = null where s.payout_id = v_id;
    update public.merchant_adjustments a set payout_id = null where a.payout_id = v_id;
    delete from public.merchant_payouts p where p.id = v_id;
    return;
  end if;

  update public.merchant_payouts p
     set amount_cad = v_orders + v_adjustments, order_count = v_count, adjustments_cad = v_adjustments
   where p.id = v_id;

  -- A payment started by a person, not by the Friday run, is on the audit log
  -- with the claim it belongs to — same transaction, so there is never one
  -- without the other.
  if p_actor_id is not null then
    perform private.admin_audit_write(
      p_actor_id, 'payout.pay_merchant', 'payout'::public.audit_subject, v_id,
      (select v.name from public.vendors v where v.id = p_vendor_id), null,
      jsonb_build_object('amountCad', jsonb_build_object('from', null, 'to', v_orders + v_adjustments))
    );
  end if;

  return query select v_id, v_orders + v_adjustments, v_count, false, now();
end;
$function$;
--> statement-breakpoint
revoke execute on function public.merchant_payout_claim(uuid, timestamptz, text, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.merchant_payout_claim(uuid, timestamptz, text, uuid) to service_role;
--> statement-breakpoint

-- Stripe refused the transfer: nothing moved, so the orders and adjustments go
-- back to the pool for the next run, and the payout stays as the record of the
-- attempt. Only an open payout can be released — one already paid, or already
-- set aside for a person to look at, is left alone.
create function public.merchant_payout_release(p_payout_id uuid, p_error text)
returns boolean
language plpgsql
set search_path = ''
as $function$
begin
  update public.merchant_payouts p
     set status = 'failed', reason = 'stripe_error', error = left(p_error, 500)
   where p.id = p_payout_id and p.status = 'pending';
  if not found then
    return false;
  end if;
  update public.order_settlements s set payout_id = null where s.payout_id = p_payout_id;
  update public.merchant_adjustments a set payout_id = null where a.payout_id = p_payout_id;
  return true;
end;
$function$;
--> statement-breakpoint
revoke execute on function public.merchant_payout_release(uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.merchant_payout_release(uuid, text) to service_role;
--> statement-breakpoint

-- The shop's part of a refund given on a delivered order (`refundShareOf`).
--
-- If the order has not been paid out, it simply lowers what the order is worth
-- to the shop. If it has — or is in a payout being made right now — it becomes
-- an adjustment taken off the shop's next payment. Which of the two is decided
-- under the same lock as a claim, so a refund and a payout cannot each believe
-- the other will account for it.
--
-- Returns which it was: 'reduced', 'adjusted', or 'none' for an order with no
-- settlement (never paid by card) or nothing to take.
create function public.order_settlement_refund(p_order_id uuid, p_refund_share numeric)
returns text
language plpgsql
set search_path = ''
as $function$
declare
  v_row public.order_settlements;
begin
  if p_refund_share is null or p_refund_share <= 0 then
    return 'none';
  end if;

  select * into v_row from public.order_settlements s where s.order_id = p_order_id;
  if not found then
    return 'none';
  end if;

  perform 1 from public.vendors v where v.id = v_row.vendor_id for update;
  -- Read again now that the shop is locked: a claim may have just taken it.
  select * into v_row from public.order_settlements s where s.order_id = p_order_id;

  if v_row.payout_id is null then
    update public.order_settlements s
       set refund_cad = least(s.share_cad, s.refund_cad + p_refund_share)
     where s.order_id = p_order_id;
    return 'reduced';
  end if;

  insert into public.merchant_adjustments (vendor_id, order_id, amount_cad, reason)
  values (v_row.vendor_id, p_order_id, -p_refund_share, 'refund_after_payout');
  return 'adjusted';
end;
$function$;
--> statement-breakpoint
revoke execute on function public.order_settlement_refund(uuid, numeric) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.order_settlement_refund(uuid, numeric) to service_role;
