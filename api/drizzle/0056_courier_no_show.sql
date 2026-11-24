-- A courier who accepts a run and never comes for it.
--
-- Accepting a run takes the order out of dispatch: nobody else is offered it.
-- If the courier then never reaches the shop — app closed, changed their mind
-- without saying so, phone dead — the order sat at `ready` with a courier's name
-- on it and nothing moving. The courier can hand the run back (0054) and staff
-- can cancel, but both need somebody to act. This is the timer for when nobody
-- does.
--
-- The clock is the courier's own promise: `accepted_at + pickup_eta_min`, the
-- arrival time worked out when they accepted. A fixed delay would punish a
-- courier legitimately coming from far and wait too long on one who was round
-- the corner. Two delays past that time:
--   • after `courier_late_remind_min` the courier is reminded once;
--   • after `courier_late_release_min` the run is taken back and returns to
--     dispatch, exactly as if they had handed it back — with `no_show` as the
--     reason, so the order still says who that was.
--
-- Taking the run back is 0054's `delivery_release`: it only matches a run that
-- is still this courier's and still not picked up, so a courier who picks up in
-- the second the timer fires keeps the run.

alter table public.platform_settings
  add column if not exists courier_late_remind_min integer not null default 5,
  add column if not exists courier_late_release_min integer not null default 15;

alter table public.platform_settings
  drop constraint if exists platform_settings_courier_late_remind_check,
  -- 0 = no reminder.
  add constraint platform_settings_courier_late_remind_check check (courier_late_remind_min between 0 and 240),
  drop constraint if exists platform_settings_courier_late_release_check,
  -- 0 = the run is never taken back automatically. Otherwise it comes after the reminder, when there is one.
  add constraint platform_settings_courier_late_release_check
    check (
      courier_late_release_min = 0
      or (courier_late_release_min between 1 and 1440 and courier_late_release_min > courier_late_remind_min)
    );

comment on column public.platform_settings.courier_late_remind_min is
  'Minutes past the expected pickup time before the courier is reminded. 0 = no reminder.';
comment on column public.platform_settings.courier_late_release_min is
  'Minutes past the expected pickup time before the run is taken back and re-dispatched. 0 = never automatically.';

alter table public.order_deliveries
  add column if not exists late_reminded_at timestamptz;

comment on column public.order_deliveries.late_reminded_at is
  'When this courier was reminded they are late for pickup. Lives on the delivery row, so the next courier to take the order starts clean.';

-- `no_show` joins the reasons a courier no longer has an order. Like
-- `order_cancelled` it is written by the system, never chosen by a courier.
alter table public.delivery_releases
  drop constraint if exists delivery_releases_reason_check,
  add constraint delivery_releases_reason_check
    check (reason in ('vehicle_problem', 'too_far', 'shop_delay', 'personal', 'other', 'order_cancelled', 'no_show'));

/*
 * Runs accepted and not picked up, at least `p_min_late_min` past the time the
 * courier was expected at the shop. Most overdue first.
 *
 * `has_open_issue` is a courier who reported a problem on this run — a shop
 * that will not hand the bag over, say. That is a person's call, and the timer
 * leaves it alone. `p_max_late_min` bounds what the automatic sweep may act on,
 * as in `dispatch_stalled_orders`; the back office passes null.
 */
create or replace function public.deliveries_awaiting_pickup(
  p_min_late_min integer,
  p_max_late_min integer default null
)
returns table (
  order_id uuid,
  courier_id uuid,
  courier_name text,
  vendor_id uuid,
  vendor_name text,
  customer_name text,
  total_cad numeric,
  accepted_at timestamptz,
  due_at timestamptz,
  late_min integer,
  reminded boolean,
  has_open_issue boolean
)
language sql
stable
set search_path = ''
as $$
  select o.id,
         d.courier_id,
         c.full_name,
         o.vendor_id,
         v.name,
         o.customer_name,
         o.total_cad,
         d.accepted_at,
         w.due,
         floor(extract(epoch from (now() - w.due)) / 60)::integer,
         d.late_reminded_at is not null,
         exists (select 1 from public.courier_issues i where i.order_id = o.id and i.status = 'open')
    from public.order_deliveries d
    join public.orders o on o.id = d.order_id
    join public.vendors v on v.id = o.vendor_id
    join public.couriers c on c.id = d.courier_id
   cross join lateral (select d.accepted_at + make_interval(mins => d.pickup_eta_min) as due) w
   where o.status = 'ready'
     and d.picked_up_at is null
     and d.delivered_at is null
     and w.due <= now() - make_interval(mins => p_min_late_min)
     and (p_max_late_min is null or w.due > now() - make_interval(mins => p_max_late_min))
   order by w.due asc
   limit 200;
$$;

revoke execute on function public.deliveries_awaiting_pickup(integer, integer) from public, anon, authenticated;
grant execute on function public.deliveries_awaiting_pickup(integer, integer) to service_role;

/*
 * `settings_update`, with the two new keys. The body is 0055's plus those two
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
         courier_late_remind_min = coalesce((p_patch ->> 'courierLateRemindMin')::int, s.courier_late_remind_min),
         courier_late_release_min = coalesce((p_patch ->> 'courierLateReleaseMin')::int, s.courier_late_release_min),
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
