-- Ways out of an order that is going nowhere.
--
-- Until now an order could only end two ways: delivered, or cancelled by the
-- shop before it was packed — and that cancellation moved a status and nothing
-- else. A shopper could not cancel, the back office could not cancel, a courier
-- who accepted a run was holding it for good, and an order no courier took sat
-- at `ready` forever. Each of those left a paid order open with nobody able to
-- close it.
--
-- This migration adds:
--   • who cancelled an order, when and why (`orders.cancelled_*`, `cancel_*`);
--   • one cancellation path that also undoes what placing the order did — the
--     stock, the points spent, the coupon use — and frees the courier;
--   • a courier handing a run back before pickup (`delivery_releases`);
--   • the list of orders waiting too long for a courier, and the two delays
--     that say when staff are told and when the order is cancelled.
--
-- The refund itself is not here: Stripe is called by the API once the
-- cancellation has landed, and `order_cancel_refunded` records what came back.
-- Cancel first, refund second — the other order could refund an order that a
-- shop confirmed in the same second and then went on to deliver.

-- ── who cancelled, when, why ────────────────────────────────────────────────

alter table public.orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_by_id uuid,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note text,
  add column if not exists no_courier_alerted_at timestamptz;

alter table public.orders
  drop constraint if exists orders_cancelled_by_check,
  add constraint orders_cancelled_by_check
    check (cancelled_by is null or cancelled_by in ('customer', 'merchant', 'admin', 'system')),
  drop constraint if exists orders_cancel_reason_check,
  add constraint orders_cancel_reason_check check (cancel_reason is null or char_length(cancel_reason) <= 40),
  drop constraint if exists orders_cancel_note_check,
  add constraint orders_cancel_note_check check (cancel_note is null or char_length(cancel_note) <= 500);

comment on column public.orders.cancelled_by is
  'customer, merchant, admin, or system (no courier found). Null on an order cancelled before 0054: nothing recorded who did it.';
comment on column public.orders.cancel_reason is
  'A short code the app translates: the shopper''s chosen reason, or no_courier for the system. Null for staff, who write cancel_note instead.';
comment on column public.orders.no_courier_alerted_at is
  'When staff were last told this order was waiting for a courier. Compared with how long it has been waiting, so a run handed back later can alert again.';

-- The orders already cancelled get the time it happened, read off their history.
-- Not who: only the shop could cancel until now, but most of these rows are
-- seeded history, and writing "merchant" on them would be inventing a fact.
update public.orders o
   set cancelled_at = h.at
  from (
    select order_id, max(at) as at
      from public.order_status_history
     where status = 'cancelled'
     group by order_id
  ) h
 where h.order_id = o.id
   and o.status = 'cancelled'
   and o.cancelled_at is null;

-- ── a courier handing a run back ────────────────────────────────────────────

create table if not exists public.delivery_releases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete cascade,
  -- `order_cancelled` is written by the cancellation path, never chosen by a courier.
  reason text not null
    check (reason in ('vehicle_problem', 'too_far', 'shop_delay', 'personal', 'other', 'order_cancelled')),
  note text check (note is null or char_length(note) <= 500),
  accepted_at timestamptz not null,
  -- Set only when the order was cancelled with the bag already in the courier's hands.
  picked_up_at timestamptz,
  released_at timestamptz not null default now()
);

comment on table public.delivery_releases is
  'Every courier who held an order and no longer does: handed back before pickup, or the order was cancelled under them. `order_deliveries` only ever holds the current courier.';

create index if not exists delivery_releases_order_id_idx on public.delivery_releases (order_id);
create index if not exists delivery_releases_courier_id_idx on public.delivery_releases (courier_id);

alter table public.delivery_releases enable row level security;
revoke all on table public.delivery_releases from public, anon, authenticated;
grant select, insert, update, delete on table public.delivery_releases to service_role;

-- ── how long an order may wait for a courier ────────────────────────────────

alter table public.platform_settings
  add column if not exists no_courier_alert_min integer not null default 15,
  add column if not exists no_courier_cancel_min integer not null default 60;

alter table public.platform_settings
  drop constraint if exists platform_settings_no_courier_alert_check,
  add constraint platform_settings_no_courier_alert_check check (no_courier_alert_min between 1 and 1440),
  drop constraint if exists platform_settings_no_courier_cancel_check,
  -- 0 switches the automatic cancellation off; otherwise it has to come after the alert.
  add constraint platform_settings_no_courier_cancel_check
    check (no_courier_cancel_min = 0 or (no_courier_cancel_min > no_courier_alert_min and no_courier_cancel_min <= 1440));

comment on column public.platform_settings.no_courier_alert_min is
  'Minutes a packed order waits with no courier before staff are told.';
comment on column public.platform_settings.no_courier_cancel_min is
  'Minutes a packed order waits with no courier before it is cancelled and refunded. 0 = never automatically.';

-- ── the cancellation itself ─────────────────────────────────────────────────

/*
 * Cancel an order and undo what placing it did. One transaction.
 *
 * `p_from` is the status the caller read: the update only lands if the order
 * is still there, so a shopper cancelling in the same second the shop confirms
 * loses cleanly (SGB04) instead of cancelling an order being prepared.
 *
 * What comes back, mirroring `order_place` line for line:
 *   • the stock it took;
 *   • the points it spent — as a credit, since the ledger is append-only. The
 *     `order_refunded` reason is free on an order that was never delivered
 *     (nothing was earned on it), and "points returned, order refunded" is what
 *     the row means;
 *   • its use of a coupon, and the count that use incremented.
 *
 * And the courier: whoever was carrying it is released, with a line in
 * `delivery_releases` so the order still says who that was. A live offer is
 * closed so it stops ringing on a phone.
 */
create or replace function private.order_cancel_apply(
  p_order_id uuid,
  p_from text,
  p_by text,
  p_by_id uuid,
  p_reason text,
  p_note text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_now       timestamptz := now();
  v_order     public.orders;
  v_delivery  public.order_deliveries;
  v_coupon_id uuid;
begin
  update public.orders
     set status = 'cancelled',
         cancelled_at = v_now,
         cancelled_by = p_by,
         cancelled_by_id = p_by_id,
         cancel_reason = nullif(btrim(p_reason), ''),
         cancel_note = nullif(btrim(p_note), '')
   where id = p_order_id
     and status = p_from::public.order_status
     and status not in ('delivered', 'cancelled')
  returning * into v_order;

  if v_order.id is null then
    raise exception using
      errcode = 'SGB04',
      message = 'The order status changed while you were acting on it';
  end if;

  insert into public.order_status_history (order_id, status, at)
  values (p_order_id, 'cancelled', v_now);

  update public.products p
     set stock_qty = p.stock_qty + i.qty,
         updated_at = v_now
    from (
      select product_id, sum(qty)::integer as qty
        from public.order_items
       where order_id = p_order_id
       group by product_id
    ) i
   where p.id = i.product_id;

  if coalesce(v_order.points_redeemed, 0) > 0 then
    insert into public.loyalty_transactions (customer_id, points, reason, order_id, expires_at)
    values (v_order.customer_id, v_order.points_redeemed, 'order_refunded', p_order_id, null)
    on conflict do nothing;
  end if;

  for v_coupon_id in
    delete from public.coupon_redemptions where order_id = p_order_id returning coupon_id
  loop
    update public.coupons set used_count = greatest(used_count - 1, 0) where id = v_coupon_id;
  end loop;

  delete from public.order_deliveries
   where order_id = p_order_id
     and delivered_at is null
  returning * into v_delivery;

  if v_delivery.order_id is not null then
    insert into public.delivery_releases (order_id, courier_id, reason, accepted_at, picked_up_at, released_at)
    values (p_order_id, v_delivery.courier_id, 'order_cancelled', v_delivery.accepted_at, v_delivery.picked_up_at, v_now);
  end if;

  update public.dispatch_offers
     set outcome = 'expired'
   where order_id = p_order_id and outcome is null;

  return jsonb_build_object(
    'cancelledAt', v_now,
    'courierId', v_delivery.courier_id,
    'pickedUp', v_delivery.picked_up_at is not null
  );
end;
$$;

revoke execute on function private.order_cancel_apply(uuid, text, text, uuid, text, text) from public, anon, authenticated;
-- `private` has no default privileges, unlike `public`: without this grant only
-- the owner could run it, and the two functions below — which run as their
-- caller, the API's role — would be refused the moment they called it.
grant execute on function private.order_cancel_apply(uuid, text, text, uuid, text, text) to service_role;

/* A shopper, a shop, or the system. Staff go through `admin_order_cancel`, which also writes the audit entry. */
create or replace function public.order_cancel(
  p_order_id uuid,
  p_from text,
  p_by text,
  p_by_id uuid default null,
  p_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_by not in ('customer', 'merchant', 'system') then
    raise exception using errcode = '22023', message = 'order_cancel: unknown actor';
  end if;
  return private.order_cancel_apply(p_order_id, p_from, p_by, p_by_id, p_reason, p_note);
end;
$$;

revoke execute on function public.order_cancel(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.order_cancel(uuid, text, text, uuid, text, text) to service_role;

/* Staff cancel any order still in flight. The reason is theirs to write and lands in the audit log with the move. */
create or replace function public.admin_order_cancel(
  p_admin_id uuid,
  p_order_id uuid,
  p_from text,
  p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := private.order_cancel_apply(p_order_id, p_from, 'admin', p_admin_id, null, p_reason);

  perform private.admin_audit_write(
    p_admin_id, 'order.cancel', 'order'::public.audit_subject, p_order_id, null, p_reason,
    jsonb_build_object(
      'status', jsonb_build_object('from', p_from, 'to', 'cancelled'),
      'courierId', jsonb_build_object('from', v_result -> 'courierId', 'to', null)
    )
  );

  return v_result;
end;
$$;

revoke execute on function public.admin_order_cancel(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_order_cancel(uuid, uuid, text, text) to service_role;

/*
 * What Stripe sent back for a cancelled order. False when the order was already
 * stamped — a retry, or staff who refunded it by hand in between — so the caller
 * knows nothing was written.
 */
create or replace function public.order_cancel_refunded(
  p_order_id uuid,
  p_amount_cad numeric,
  p_stripe_refund_id text,
  p_reason text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.orders
     set refunded_at = now(),
         refund_amount_cad = p_amount_cad,
         stripe_refund_id = p_stripe_refund_id,
         refund_reason = p_reason
   where id = p_order_id
     and status = 'cancelled'
     and refunded_at is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.order_cancel_refunded(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.order_cancel_refunded(uuid, numeric, text, text) to service_role;

-- ── a run handed back ───────────────────────────────────────────────────────

/*
 * The courier gives the run back, before pickup only. Once the bag is in their
 * hands there is nothing to hand back to — that is an incident report, and a
 * person decides.
 *
 * The delete is the whole test: this courier's row, on an order still `ready`,
 * not picked up. Nothing deleted means the run is no longer theirs to release
 * (SGB12). The order then has no courier and no live offer, which is exactly
 * what `dispatch_waiting_orders` looks for; `dispatch_next_courier` skips anyone
 * already offered this order, so it does not come straight back to them.
 */
create or replace function public.delivery_release(
  p_order_id uuid,
  p_courier_id uuid,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_delivery public.order_deliveries;
begin
  delete from public.order_deliveries d
   using public.orders o
   where d.order_id = p_order_id
     and d.courier_id = p_courier_id
     and d.picked_up_at is null
     and d.delivered_at is null
     and o.id = d.order_id
     and o.status = 'ready'
  returning d.* into v_delivery;

  if v_delivery.order_id is null then
    raise exception using errcode = 'SGB12', message = 'This run can no longer be handed back';
  end if;

  insert into public.delivery_releases (order_id, courier_id, reason, note, accepted_at)
  values (p_order_id, p_courier_id, p_reason, nullif(btrim(p_note), ''), v_delivery.accepted_at);
end;
$$;

revoke execute on function public.delivery_release(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.delivery_release(uuid, uuid, text, text) to service_role;

-- ── orders nobody is carrying ───────────────────────────────────────────────

/*
 * Packed orders with no courier, waiting at least `p_min_waiting_min`.
 *
 * "Waiting since" is when the order became `ready`, or when a courier last
 * handed it back if that is later — a run released after forty minutes has not
 * been without a courier for forty minutes.
 *
 * `p_max_waiting_min` bounds what the automatic sweep may act on. An order
 * waiting for days is not a dispatch problem any more, and cancelling it on a
 * timer — the day this ships, every such order at once — is a decision for a
 * person. The back office passes null and sees them all.
 */
create or replace function public.dispatch_stalled_orders(
  p_min_waiting_min integer,
  p_max_waiting_min integer default null
)
returns table (
  order_id uuid,
  vendor_id uuid,
  vendor_name text,
  customer_name text,
  total_cad numeric,
  waiting_since timestamptz,
  waiting_min integer,
  alerted boolean,
  offers integer
)
language sql
stable
set search_path = ''
as $$
  select o.id,
         o.vendor_id,
         v.name,
         o.customer_name,
         o.total_cad,
         w.since,
         floor(extract(epoch from (now() - w.since)) / 60)::integer,
         (o.no_courier_alerted_at is not null and o.no_courier_alerted_at >= w.since),
         (select count(*)::integer from public.dispatch_offers f where f.order_id = o.id)
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
   cross join lateral (
     select greatest(
              coalesce(
                (select max(h.at) from public.order_status_history h where h.order_id = o.id and h.status = 'ready'),
                o.created_at
              ),
              coalesce(
                (select max(r.released_at) from public.delivery_releases r where r.order_id = o.id),
                '-infinity'::timestamptz
              )
            ) as since
   ) w
   where o.status = 'ready'
     and not exists (select 1 from public.order_deliveries d where d.order_id = o.id)
     and w.since <= now() - make_interval(mins => p_min_waiting_min)
     and (p_max_waiting_min is null or w.since > now() - make_interval(mins => p_max_waiting_min))
   order by w.since asc
   limit 200;
$$;

revoke execute on function public.dispatch_stalled_orders(integer, integer) from public, anon, authenticated;
grant execute on function public.dispatch_stalled_orders(integer, integer) to service_role;

-- ── the two delays, editable from the back office ───────────────────────────

/*
 * `settings_update`, with the two new keys. The body is the one in the database
 * today plus those two lines: only the keys present in the patch are written.
 */
create or replace function public.settings_update(p_admin_id uuid, p_patch jsonb, p_changes jsonb)
returns public.platform_settings
language plpgsql
as $$
declare
  v_row public.platform_settings;
begin
  -- Only the keys actually present in the patch are written. `jsonb` distinguishes
  -- an absent key from an explicit null, which a set of nullable arguments could not.
  update public.platform_settings s
     set points_per_cad = coalesce((p_patch ->> 'pointsPerCad')::numeric, s.points_per_cad),
         points_per_cad_redeemed = coalesce((p_patch ->> 'pointsPerCadRedeemed')::numeric, s.points_per_cad_redeemed),
         max_redemption_share = coalesce((p_patch ->> 'maxRedemptionShare')::numeric, s.max_redemption_share),
         points_expiry_months = coalesce((p_patch ->> 'pointsExpiryMonths')::int, s.points_expiry_months),
         referral_reward_points = coalesce((p_patch ->> 'referralRewardPoints')::int, s.referral_reward_points),
         referral_min_first_order_cad = coalesce((p_patch ->> 'referralMinFirstOrderCad')::numeric, s.referral_min_first_order_cad),
         double_points_active = coalesce((p_patch ->> 'doublePointsActive')::boolean, s.double_points_active),
         double_points_starts_at = case when p_patch ? 'doublePointsStartsAt'
                                        then (p_patch ->> 'doublePointsStartsAt')::timestamptz
                                        else s.double_points_starts_at end,
         double_points_ends_at   = case when p_patch ? 'doublePointsEndsAt'
                                        then (p_patch ->> 'doublePointsEndsAt')::timestamptz
                                        else s.double_points_ends_at end,
         commission_rate = coalesce((p_patch ->> 'commissionRate')::numeric, s.commission_rate),
         monthly_subscription_cad = coalesce((p_patch ->> 'monthlySubscriptionCad')::numeric, s.monthly_subscription_cad),
         courier_location_retention_days = coalesce((p_patch ->> 'courierLocationRetentionDays')::int, s.courier_location_retention_days),
         delivery_proof_retention_days = coalesce((p_patch ->> 'deliveryProofRetentionDays')::int, s.delivery_proof_retention_days),
         no_courier_alert_min = coalesce((p_patch ->> 'noCourierAlertMin')::int, s.no_courier_alert_min),
         no_courier_cancel_min = coalesce((p_patch ->> 'noCourierCancelMin')::int, s.no_courier_cancel_min),
         updated_at = now()
   where s.id = 1
  returning * into v_row;

  if v_row.id is null then
    raise exception using errcode = 'SGB05', message = 'Platform settings row is missing';
  end if;

  perform private.admin_audit_write(
    p_admin_id, 'settings.update', 'settings'::audit_subject,
    -- No uuid to point at: there is exactly one settings row, by check
    -- constraint. `subject_label` carries what a reader needs instead.
    null, 'Réglages de la plateforme', null, p_changes
  );

  return v_row;
end;
$$;
