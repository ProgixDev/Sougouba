-- Sortable orders and users lists, sorted where the rows are.
--
-- The back office sorted these tables in the browser, over whatever page it
-- had loaded — so "biggest order first" meant "biggest of the twenty on
-- screen". Paginated from the database, the sort has to happen before the
-- page is cut. Same functions, two more parameters; everything else is as
-- before.
--
-- Each sort key is spelled out (no dynamic SQL): a column name never reaches
-- the query from the request. Unknown keys fall back to the default order.
-- The `id` tiebreak keeps paging stable when two rows share a sort value.

drop function if exists public.admin_list_orders(text, uuid, text, text, integer, integer);
--> statement-breakpoint

create function public.admin_list_orders(
  p_status text default null,
  p_vendor_id uuid default null,
  p_search text default null,
  p_id_prefix text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'created_at',
  p_dir text default 'desc'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_items jsonb;
  v_total integer;
  v_asc boolean := lower(coalesce(p_dir, 'desc')) = 'asc';
begin
  with matched as (
    select o.*, v.name as vendor_name, v.vendor_type
      from public.orders o
      join public.vendors v on v.id = o.vendor_id
     where (p_status    is null or o.status = p_status::public.order_status)
       and (p_vendor_id is null or o.vendor_id = p_vendor_id)
       and (
         p_search is null
         or o.customer_name ilike p_search
         or v.name          ilike p_search
         or o.id::text      like  p_id_prefix
       )
  ),
  ranked as (
    select m.*,
           row_number() over (
             order by
               case when p_sort = 'total'    and     v_asc then m.total_cad end asc nulls last,
               case when p_sort = 'total'    and not v_asc then m.total_cad end desc nulls last,
               case when p_sort = 'customer' and     v_asc then lower(nullif(trim(m.customer_name), '')) end asc nulls last,
               case when p_sort = 'customer' and not v_asc then lower(nullif(trim(m.customer_name), '')) end desc nulls last,
               case when v_asc then m.created_at end asc,
               m.created_at desc,
               m.id desc
           ) as rn
      from matched m
  )
  select
    coalesce(
      (select jsonb_agg(row order by rn)
         from (
           select r.rn,
                  jsonb_build_object(
                    'id',              r.id,
                    'status',          r.status,
                    'createdAt',       r.created_at,
                    'subtotalCad',     r.subtotal_cad::float8,
                    'totalCad',        r.total_cad::float8,
                    'customerId',      r.customer_id,
                    'customerName',    r.customer_name,
                    'vendorId',        r.vendor_id,
                    'vendorName',      r.vendor_name,
                    'vendorType',      r.vendor_type,
                    'courierName',     c.full_name,
                    'refundedAt',      r.refunded_at,
                    'refundAmountCad', r.refund_amount_cad::float8,
                    'hasDispute',      (d.order_id is not null),
                    'hasCourierIssue', (ci.order_id is not null)
                  ) as row
             from ranked r
             left join public.order_deliveries od on od.order_id = r.id
             left join public.couriers        c  on c.id        = od.courier_id
             left join public.disputes        d  on d.order_id  = r.id
             left join public.courier_issues  ci on ci.order_id = r.id
            where r.rn > p_offset and r.rn <= p_offset + p_limit
         ) page),
      '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_list_orders(text, uuid, text, text, integer, integer, text, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_list_orders(text, uuid, text, text, integer, integer, text, text) to service_role;
--> statement-breakpoint

drop function if exists public.admin_list_users(text, text, integer, integer);
--> statement-breakpoint

create function public.admin_list_users(
  p_role text default null,
  p_pattern text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'member_since',
  p_dir text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_items jsonb;
  v_total integer;
  v_asc boolean := lower(coalesce(p_dir, 'desc')) = 'asc';
begin
  with matched as (
    select p.id, p.full_name, u.email, p.role, p.member_since,
           p.vendor_id, p.courier_id, u.last_sign_in_at
      from public.profiles p
      -- Left, not inner: a profile whose auth row has gone should still appear
      -- in the directory rather than silently vanish from it.
      left join auth.users u on u.id = p.id
     where (p_role is null or p.role = p_role::public.role)
       and (p_pattern is null or p.full_name ilike p_pattern or u.email ilike p_pattern)
  ),
  ranked as (
    select m.*,
           row_number() over (
             order by
               case when p_sort = 'name'       and     v_asc then lower(nullif(trim(m.full_name), '')) end asc nulls last,
               case when p_sort = 'name'       and not v_asc then lower(nullif(trim(m.full_name), '')) end desc nulls last,
               case when p_sort = 'last_seen'  and     v_asc then m.last_sign_in_at end asc nulls last,
               case when p_sort = 'last_seen'  and not v_asc then m.last_sign_in_at end desc nulls last,
               case when v_asc then m.member_since end asc,
               m.member_since desc,
               m.id desc
           ) as rn
      from matched m
  )
  select
    coalesce((select jsonb_agg(
               jsonb_build_object(
                 'id', id, 'fullName', full_name, 'email', email, 'role', role,
                 'memberSince', member_since, 'vendorId', vendor_id,
                 'courierId', courier_id, 'lastSignInAt', last_sign_in_at
               ) order by rn)
             from ranked
            where rn > p_offset and rn <= p_offset + p_limit),
             '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_list_users(text, text, integer, integer, text, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_list_users(text, text, integer, integer, text, text) to service_role;
