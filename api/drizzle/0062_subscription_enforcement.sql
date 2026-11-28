-- The monthly subscription, enforced (CDC addendum v1.1, §05).
--
-- Until now a shop's subscription was billed and displayed and nothing more: a
-- shop that never subscribed, or whose card had failed for months, kept
-- selling. From here an administrator can require it. A shop whose subscription
-- is not in order then leaves the catalogue and takes no new order
-- (`vendor_status.subscription_hold`, 0061) until it is — orders already placed
-- are carried through.
--
-- The rule itself is in the API (`billing/subscription-standing.ts`), where it
-- has tests. The database holds what the rule reads, and the one write that
-- moves a shop.

-- ── what the rule reads ─────────────────────────────────────────────────────

alter table public.platform_settings
  -- Off by default: applying this migration changes nothing for any shop.
  add column subscription_required boolean not null default false,
  -- How long a shop keeps selling after a renewal fails, while Stripe retries
  -- the card. 0 takes it offline at the first failure.
  add column subscription_grace_days integer not null default 7
    constraint platform_settings_subscription_grace_days_check
      check (subscription_grace_days between 0 and 60);
--> statement-breakpoint

comment on column public.platform_settings.subscription_required is
  'When true, an approved shop sells only while its monthly subscription is in order.';
--> statement-breakpoint
comment on column public.platform_settings.subscription_grace_days is
  'Days a shop keeps selling after its subscription first becomes overdue.';
--> statement-breakpoint

-- When the subscription *became* overdue. Stripe's own dates cannot answer
-- that: an unpaid subscription keeps opening a new billing period every month,
-- so its period start moves and a shop would be handed a fresh grace each time.
-- Set by the API the first time it sees the subscription overdue, cleared when
-- it sees it otherwise.
alter table public.merchant_subscriptions
  add column past_due_since timestamptz;
--> statement-breakpoint

comment on column public.merchant_subscriptions.past_due_since is
  'When the subscription was first seen overdue; null while it is not. The grace period runs from here.';
--> statement-breakpoint

-- A subscription already overdue has been so since, at the latest, the last
-- time its row was written.
update public.merchant_subscriptions
   set past_due_since = updated_at
 where status = 'past_due';
--> statement-breakpoint

-- ── the one write that moves a shop ─────────────────────────────────────────

/*
 * Take an approved shop offline for its subscription, or bring it back.
 *
 * Returns whether anything moved. Each direction only acts on the status it
 * expects, so this can never touch a pending, rejected or suspended shop — and
 * two callers reaching the same shop at once (a webhook and the hourly pass)
 * move it once and log it once.
 *
 * `reviewed_by`, `reviewed_at` and `status_reason` are left alone: they record
 * an administrator's review of the shop, and nobody reviewed anything here.
 * The log entry is written directly rather than through
 * `private.admin_audit_write`, which names an administrator; this has none.
 */
create or replace function public.vendor_subscription_hold(p_vendor_id uuid, p_hold boolean, p_cause text)
returns boolean
language plpgsql
as $$
declare
  v_name text;
begin
  if p_hold then
    update public.vendors
       set status = 'subscription_hold', updated_at = now()
     where id = p_vendor_id and status = 'approved'
    returning name into v_name;
  else
    update public.vendors
       set status = 'approved', updated_at = now()
     where id = p_vendor_id and status = 'subscription_hold'
    returning name into v_name;
  end if;

  if v_name is null then
    return false;
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_name, action, subject_type, subject_id, subject_label, reason, changes
  ) values (
    null,
    'Sougouba (automatique)',
    case when p_hold then 'vendor.subscription_hold' else 'vendor.subscription_release' end,
    'vendor'::audit_subject,
    p_vendor_id,
    v_name,
    p_cause,
    jsonb_build_object('status', jsonb_build_object(
      'from', case when p_hold then 'approved' else 'subscription_hold' end,
      'to',   case when p_hold then 'subscription_hold' else 'approved' end
    ))
  );

  return true;
end;
$$;
--> statement-breakpoint

revoke execute on function public.vendor_subscription_hold(uuid, boolean, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.vendor_subscription_hold(uuid, boolean, text) to service_role;
--> statement-breakpoint

-- ── the settings form ───────────────────────────────────────────────────────

/*
 * `settings_update`, with the two new keys. The body is 0056's plus those two
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
         subscription_required = coalesce((p_patch ->> 'subscriptionRequired')::boolean, s.subscription_required),
         subscription_grace_days = coalesce((p_patch ->> 'subscriptionGraceDays')::int, s.subscription_grace_days),
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
