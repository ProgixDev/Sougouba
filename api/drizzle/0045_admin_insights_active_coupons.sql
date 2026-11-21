-- "Codes promo actifs" counted codes that checkout would refuse.
--
-- 0044 counted every coupon not yet expired, so a code scheduled for next week
-- or one already used up still showed as active on the moderation page. Active
-- now means what checkout accepts: started, not expired, uses left. The rest
-- of the function is unchanged.
create or replace function public.admin_insights(p_area text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := now();
  v_30 timestamptz := now() - interval '30 days';
  v_tz text := 'America/Montreal';
begin
  if p_area = 'vendors' then
    return jsonb_build_object(
      'byStatus', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select status::text s, count(*) n from public.vendors group by status) x),
      'byType', (select coalesce(jsonb_object_agg(t, n), '{}') from (
         select vendor_type::text t, count(*) n from public.vendors where status = 'approved' group by vendor_type) x),
      'new30', (select count(*) from public.vendors where created_at >= v_30),
      'avgRating', (select round(avg(rating) filter (where review_count > 0), 2) from public.vendors where status = 'approved'),
      'avgApprovalHours', (select round(extract(epoch from avg(reviewed_at - created_at)) / 3600, 1)
                             from public.vendors where status = 'approved' and reviewed_at is not null),
      'sales30', (select coalesce(sum(subtotal_cad), 0) from public.orders where created_at >= v_30 and status <> 'cancelled'),
      'orders30', (select count(*) from public.orders where created_at >= v_30 and status <> 'cancelled'),
      'signupsByWeek', (select jsonb_agg(jsonb_build_object('week', w::date, 'count', (
           select count(*) from public.vendors v
            where v.created_at >= w and v.created_at < w + interval '7 days')) order by w)
         from generate_series(date_trunc('week', v_now) - interval '7 weeks', date_trunc('week', v_now), interval '1 week') w),
      'top', (select coalesce(jsonb_agg(t order by t.sales desc), '[]') from (
         select v.id, v.name, coalesce(sum(o.subtotal_cad), 0) sales, count(o.id) orders
           from public.vendors v
           join public.orders o on o.vendor_id = v.id and o.created_at >= v_30 and o.status <> 'cancelled'
          group by v.id, v.name order by sales desc limit 5) t)
    );

  elsif p_area = 'couriers' then
    return jsonb_build_object(
      'byStatus', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select status::text s, count(*) n from public.couriers group by status) x),
      'byVehicle', (select coalesce(jsonb_object_agg(t, n), '{}') from (
         select vehicle::text t, count(*) n from public.couriers where status = 'approved' group by vehicle) x),
      'online', (select count(*) from public.couriers where is_online and status = 'approved'),
      'avgRating', (select round(avg(rating) filter (where delivery_count > 0), 2) from public.couriers where status = 'approved'),
      'deliveries30', (select count(*) from public.order_deliveries where delivered_at >= v_30),
      'avgDeliveryMinutes', (select round(extract(epoch from avg(delivered_at - picked_up_at)) / 60, 1)
                               from public.order_deliveries where delivered_at >= v_30 and picked_up_at is not null),
      'earnings30', (select coalesce(sum(earnings_cad + coalesce(tip_cad, 0)), 0) from public.order_deliveries where delivered_at >= v_30),
      'deliveriesByDay', (select jsonb_agg(jsonb_build_object('date', d::date, 'count', (
           select count(*) from public.order_deliveries od
            where (od.delivered_at at time zone v_tz)::date = d::date)) order by d)
         from generate_series((v_now at time zone v_tz)::date - 13, (v_now at time zone v_tz)::date, interval '1 day') d),
      'top', (select coalesce(jsonb_agg(t order by t.deliveries desc), '[]') from (
         select c.id, c.full_name as name, count(*) deliveries
           from public.order_deliveries od join public.couriers c on c.id = od.courier_id
          where od.delivered_at >= v_30
          group by c.id, c.full_name order by deliveries desc limit 5) t)
    );

  elsif p_area = 'orders' then
    return jsonb_build_object(
      'today', (select count(*) from public.orders
                 where (created_at at time zone v_tz)::date = (v_now at time zone v_tz)::date),
      'orders30', (select count(*) from public.orders where created_at >= v_30),
      'gmv30', (select coalesce(sum(total_cad), 0) from public.orders where created_at >= v_30 and status <> 'cancelled'),
      'avgBasket', (select round(avg(total_cad), 2) from public.orders where created_at >= v_30 and status <> 'cancelled'),
      'cancelRate', (select round(100.0 * count(*) filter (where status = 'cancelled') / nullif(count(*), 0), 1)
                       from public.orders where created_at >= v_30),
      'refunded30', (select coalesce(sum(refund_amount_cad), 0) from public.orders where refunded_at >= v_30),
      'active', (select count(*) from public.orders where status in ('pending','confirmed','preparing','ready','out_for_delivery')),
      'unassigned', (select count(*) from public.orders o where o.status in ('ready','preparing','confirmed')
                       and not exists (select 1 from public.order_deliveries d where d.order_id = o.id)),
      'byStatus', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select status::text s, count(*) n from public.orders where created_at >= v_30 group by status) x),
      'byDay', (select jsonb_agg(jsonb_build_object('date', d::date,
           'count', (select count(*) from public.orders o
                      where (o.created_at at time zone v_tz)::date = d::date and o.status <> 'cancelled'),
           'gmv', (select coalesce(sum(o.total_cad), 0) from public.orders o
                    where (o.created_at at time zone v_tz)::date = d::date and o.status <> 'cancelled')) order by d)
         from generate_series((v_now at time zone v_tz)::date - 29, (v_now at time zone v_tz)::date, interval '1 day') d)
    );

  elsif p_area = 'users' then
    return jsonb_build_object(
      'byRole', (select coalesce(jsonb_object_agg(coalesce(role::text, 'none'), n), '{}') from (
         select role, count(*) n from public.profiles group by role) x),
      'new30', (select count(*) from public.profiles where member_since >= v_30),
      'blocked', (select count(*) from auth.users where banned_until > v_now),
      'withOrders', (select count(distinct customer_id) from public.orders),
      'signupsByWeek', (select jsonb_agg(jsonb_build_object('week', w::date, 'count', (
           select count(*) from public.profiles p
            where p.member_since >= w and p.member_since < w + interval '7 days')) order by w)
         from generate_series(date_trunc('week', v_now) - interval '7 weeks', date_trunc('week', v_now), interval '1 week') w)
    );

  elsif p_area = 'disputes' then
    return jsonb_build_object(
      'byStatus', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select status::text s, count(*) n from public.disputes group by status) x),
      'byReason', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select reason::text s, count(*) n from public.disputes group by reason) x),
      'opened30', (select count(*) from public.disputes where opened_at >= v_30),
      'avgResolutionHours', (select round(extract(epoch from avg(resolved_at - opened_at)) / 3600, 1)
                               from public.disputes where resolved_at is not null),
      'refunded30', (select coalesce(sum(o.refund_amount_cad), 0) from public.orders o
                       join public.disputes d on d.order_id = o.id where o.refunded_at >= v_30)
    );

  elsif p_area = 'courier_issues' then
    return jsonb_build_object(
      'byStatus', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select status::text s, count(*) n from public.courier_issues group by status) x),
      'byReason', (select coalesce(jsonb_object_agg(s, n), '{}') from (
         select reason::text s, count(*) n from public.courier_issues group by reason) x),
      'reported30', (select count(*) from public.courier_issues where at >= v_30),
      'avgResolutionHours', (select round(extract(epoch from avg(resolved_at - at)) / 3600, 1)
                               from public.courier_issues where resolved_at is not null)
    );

  elsif p_area = 'support' then
    return jsonb_build_object(
      'waiting', (select count(*) from public.support_conversations where status = 'escalated'),
      'conversations30', (select count(*) from public.support_conversations where created_at >= v_30),
      'escalated30', (select count(*) from public.support_conversations where escalated_at >= v_30),
      'resolved30', (select count(*) from public.support_conversations where resolved_at >= v_30),
      'avgResolutionHours', (select round(extract(epoch from avg(resolved_at - escalated_at)) / 3600, 1)
                               from public.support_conversations where resolved_at is not null and escalated_at is not null),
      'messages30', (select count(*) from public.support_messages where created_at >= v_30 and role = 'user')
    );

  elsif p_area = 'moderation' then
    return jsonb_build_object(
      'reviews', (select count(*) from public.order_reviews where removed_at is null),
      'avgReview', (select round(avg(vendor_rating), 2) from public.order_reviews where removed_at is null),
      'lowReviews30', (select count(*) from public.order_reviews where vendor_rating <= 2 and created_at >= v_30),
      'commentsHidden', (select count(*) from public.order_reviews where comment_hidden_at is not null),
      'reviewsRemoved', (select count(*) from public.order_reviews where removed_at is not null),
      'couponsActive', (select count(*) from public.coupons
                         where (starts_at is null or starts_at <= v_now)
                           and (ends_at is null or ends_at > v_now)
                           and (usage_limit is null or used_count < usage_limit)),
      'couponUses', (select coalesce(sum(used_count), 0) from public.coupons),
      'products', (select count(*) from public.products),
      'productsHidden', (select count(*) from public.products where hidden_at is not null)
    );
  end if;

  raise exception 'Unknown insights area %', p_area using errcode = '22023';
end;
$function$;
