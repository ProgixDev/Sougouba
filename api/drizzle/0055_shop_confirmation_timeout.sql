-- A shop that never answers.
--
-- The shopper pays the moment they order, and the order then waits at
-- `pending` for the shop to accept it. Nothing bounded that wait: a shop that
-- was closed, busy, or had its phone off left a paid order open for good. The
-- shopper can now cancel themselves and so can the back office (0054), but
-- both need someone to notice. This is the timer for when nobody does.
--
-- Two delays, the way the large delivery platforms do it (Uber Eats cancels an
-- unaccepted order after about twelve minutes and rings the store after ninety
-- seconds; Deliveroo and SkipTheDishes reject after ten):
--   • after `shop_confirm_remind_min` the shop is reminded once;
--   • after `shop_confirm_cancel_min` the order is cancelled and refunded.
--
-- The cancellation itself is 0054's `order_cancel`, with the system as actor
-- and `shop_no_response` as the reason. This migration only adds the two
-- delays, the mark that a reminder went out, and the list the sweep reads.

alter table public.platform_settings
  add column if not exists shop_confirm_remind_min integer not null default 3,
  add column if not exists shop_confirm_cancel_min integer not null default 10;

alter table public.platform_settings
  drop constraint if exists platform_settings_shop_confirm_remind_check,
  -- 0 = no reminder.
  add constraint platform_settings_shop_confirm_remind_check check (shop_confirm_remind_min between 0 and 120),
  drop constraint if exists platform_settings_shop_confirm_cancel_check,
  -- 0 = never cancelled automatically. Otherwise it comes after the reminder, when there is one.
  add constraint platform_settings_shop_confirm_cancel_check
    check (
      shop_confirm_cancel_min = 0
      or (shop_confirm_cancel_min between 1 and 1440 and shop_confirm_cancel_min > shop_confirm_remind_min)
    );

comment on column public.platform_settings.shop_confirm_remind_min is
  'Minutes an order waits for the shop to accept it before the shop is reminded. 0 = no reminder.';
comment on column public.platform_settings.shop_confirm_cancel_min is
  'Minutes an order waits for the shop to accept it before it is cancelled and refunded. 0 = never automatically.';

alter table public.orders
  add column if not exists shop_reminded_at timestamptz;

comment on column public.orders.shop_reminded_at is
  'When the shop was reminded that this order is waiting for its answer. Set once: an order is only ever pending once.';

/*
 * Orders the shop has not answered, waiting at least `p_min_waiting_min`,
 * oldest first.
 *
 * The wait runs from when the order was placed: `pending` is where an order
 * starts and nothing ever returns to it. `p_max_waiting_min` bounds what the
 * automatic sweep may act on, for the reason `dispatch_stalled_orders` gives —
 * an order that has waited for days is a decision for a person, not something
 * a timer should cancel the day this ships. The back office passes null.
 */
create or replace function public.orders_awaiting_shop(
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
  reminded boolean
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
         o.created_at,
         floor(extract(epoch from (now() - o.created_at)) / 60)::integer,
         o.shop_reminded_at is not null
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
   where o.status = 'pending'
     and o.created_at <= now() - make_interval(mins => p_min_waiting_min)
     and (p_max_waiting_min is null or o.created_at > now() - make_interval(mins => p_max_waiting_min))
   order by o.created_at asc
   limit 200;
$$;

revoke execute on function public.orders_awaiting_shop(integer, integer) from public, anon, authenticated;
grant execute on function public.orders_awaiting_shop(integer, integer) to service_role;

/*
 * `settings_update`, with the two new keys. The body is 0054's plus those two
 * lines: only the keys present in the patch are written.
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
         shop_confirm_remind_min = coalesce((p_patch ->> 'shopConfirmRemindMin')::int, s.shop_confirm_remind_min),
         shop_confirm_cancel_min = coalesce((p_patch ->> 'shopConfirmCancelMin')::int, s.shop_confirm_cancel_min),
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
