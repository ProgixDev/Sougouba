-- Courier payouts, made visible.
--
-- The weekly batch moved money and kept no record of itself: a run that paid
-- three couriers and skipped eight left nothing but log lines, and a courier
-- with no Stripe account accrued forever without anyone seeing it. Two tables
-- now hold what happened — one row per run, one row per courier per run — and
-- four functions give the back office who is owed, the history, and the
-- failures. The money path itself is unchanged: transfer first, then stamp
-- `order_deliveries.paid_out_at`.

alter type public.audit_subject add value if not exists 'payout';
--> statement-breakpoint

create table public.payout_runs (
  id            uuid primary key default gen_random_uuid(),
  trigger       text not null check (trigger in ('schedule', 'admin')),
  actor_id      uuid references public.profiles (id) on delete set null,
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  paid_count    integer not null default 0,
  skipped_count integer not null default 0,
  failed_count  integer not null default 0,
  paid_cad      numeric(12, 2) not null default 0,
  error         text
);
--> statement-breakpoint

-- One run at a time, enforced where two API instances cannot both miss it.
create unique index payout_runs_one_running on public.payout_runs ((true)) where status = 'running';
--> statement-breakpoint
create index payout_runs_started_idx on public.payout_runs (started_at desc, id desc);
--> statement-breakpoint

create table public.payout_attempts (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.payout_runs (id) on delete cascade,
  courier_id         uuid not null references public.couriers (id) on delete cascade,
  amount_cad         numeric(10, 2) not null,
  run_count          integer not null,
  status             text not null check (status in ('paid', 'skipped', 'failed')),
  -- no_account: never finished Stripe onboarding. stripe_error: the transfer
  -- was refused. record_error: Stripe paid, the stamp on the runs failed — the
  -- next run replays the same idempotency key on the same day, otherwise it
  -- needs a look.
  reason             text check (reason in ('no_account', 'stripe_error', 'record_error')),
  error              text,
  stripe_transfer_id text,
  created_at         timestamptz not null default now()
);
--> statement-breakpoint
create index payout_attempts_run_idx on public.payout_attempts (run_id);
--> statement-breakpoint
create index payout_attempts_courier_idx on public.payout_attempts (courier_id, created_at desc);
--> statement-breakpoint
create index payout_attempts_status_idx on public.payout_attempts (status, created_at desc);
--> statement-breakpoint

-- Read and written through the API only, like every other table.
alter table public.payout_runs enable row level security;
--> statement-breakpoint
alter table public.payout_attempts enable row level security;
--> statement-breakpoint
revoke all on table public.payout_runs, public.payout_attempts from public, anon, authenticated;
--> statement-breakpoint
grant all on table public.payout_runs, public.payout_attempts to service_role;
--> statement-breakpoint

-- The batch's roll-up, now with how many runs each amount covers.
drop function if exists public.payouts_owed();
--> statement-breakpoint
create function public.payouts_owed()
returns table (courier_id uuid, pending_cad numeric, run_count integer, account_id text)
language sql
stable
set search_path = ''
as $function$
  select d.courier_id, sum(d.earnings_cad), count(*)::int, max(p.stripe_connect_account_id)
    from public.order_deliveries d
    left join public.courier_payouts p on p.courier_id = d.courier_id
   where d.delivered_at is not null and d.paid_out_at is null
   group by d.courier_id;
$function$;
--> statement-breakpoint
revoke execute on function public.payouts_owed() from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.payouts_owed() to service_role;
--> statement-breakpoint

-- Opens a run. A run still `running` after 30 minutes belongs to a process
-- that died mid-batch: it is closed as failed so it cannot block every later
-- one. A run started by an administrator is written to the audit log in the
-- same transaction.
create function public.payout_run_start(p_trigger text, p_actor_id uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  update public.payout_runs
     set status = 'failed', finished_at = now(), error = 'Interrompu (le processus s''est arrêté pendant le versement)'
   where status = 'running' and started_at < now() - interval '30 minutes';

  begin
    insert into public.payout_runs (trigger, actor_id) values (p_trigger, p_actor_id) returning id into v_id;
  exception when unique_violation then
    raise exception 'A payout run is already in progress' using errcode = 'SGB11';
  end;

  if p_actor_id is not null then
    perform private.admin_audit_write(
      p_actor_id, 'payout.run', 'payout'::public.audit_subject, v_id, 'Virements des livreurs', null, null
    );
  end if;

  return v_id;
end;
$function$;
--> statement-breakpoint
revoke execute on function public.payout_run_start(text, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.payout_run_start(text, uuid) to service_role;
--> statement-breakpoint

-- Who is owed, one row per courier, paged and sorted here.
create function public.admin_payouts_owed(
  p_filter text default 'all',
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'amount',
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
  with owed as (
    select d.courier_id,
           sum(d.earnings_cad)  as pending_cad,
           count(*)::int        as run_count,
           min(d.delivered_at)  as oldest_at
      from public.order_deliveries d
     where d.delivered_at is not null and d.paid_out_at is null
     group by d.courier_id
  ),
  matched as (
    select o.*, c.full_name, c.photo_url, c.status as courier_status,
           p.stripe_connect_account_id as account_id, p.status as connect_status,
           la.status as last_status, la.reason as last_reason, la.error as last_error, la.created_at as last_at
      from owed o
      join public.couriers c on c.id = o.courier_id
      left join public.courier_payouts p on p.courier_id = o.courier_id
      left join lateral (
        select a.status, a.reason, a.error, a.created_at
          from public.payout_attempts a
         where a.courier_id = o.courier_id
         order by a.created_at desc
         limit 1
      ) la on true
     where (p_search is null or c.full_name ilike p_search)
       and (
         coalesce(p_filter, 'all') = 'all'
         or (p_filter = 'no_account' and p.stripe_connect_account_id is null)
         or (p_filter = 'failed' and la.status = 'failed')
       )
  ),
  ranked as (
    select m.*,
           row_number() over (
             order by
               case when p_sort = 'oldest' and     v_asc then m.oldest_at end asc nulls last,
               case when p_sort = 'oldest' and not v_asc then m.oldest_at end desc nulls last,
               case when p_sort = 'name'   and     v_asc then lower(m.full_name) end asc nulls last,
               case when p_sort = 'name'   and not v_asc then lower(m.full_name) end desc nulls last,
               case when p_sort = 'runs'   and     v_asc then m.run_count end asc nulls last,
               case when p_sort = 'runs'   and not v_asc then m.run_count end desc nulls last,
               case when v_asc then m.pending_cad end asc,
               m.pending_cad desc,
               m.courier_id
           ) as rn
      from matched m
  )
  select
    coalesce(
      (select jsonb_agg(row order by rn)
         from (
           select r.rn,
                  jsonb_build_object(
                    'courierId',     r.courier_id,
                    'courierName',   r.full_name,
                    'photoUrl',      r.photo_url,
                    'courierStatus', r.courier_status,
                    'pendingCad',    r.pending_cad::float8,
                    'runCount',      r.run_count,
                    'oldestAt',      r.oldest_at,
                    'accountId',     r.account_id,
                    'connectStatus', r.connect_status,
                    'lastAttempt',   case when r.last_status is null then null else jsonb_build_object(
                                       'status', r.last_status, 'reason', r.last_reason,
                                       'error', r.last_error, 'at', r.last_at) end
                  ) as row
             from ranked r
            where r.rn > p_offset and r.rn <= p_offset + p_limit
         ) page),
      '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;
--> statement-breakpoint
revoke execute on function public.admin_payouts_owed(text, text, integer, integer, text, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_payouts_owed(text, text, integer, integer, text, text) to service_role;
--> statement-breakpoint

-- Every courier line of every run, newest first: the payout history, and with
-- p_status = 'failed', the failures.
create function public.admin_payout_attempts(
  p_status text default null,
  p_run_id uuid default null,
  p_courier_id uuid default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with matched as (
    select a.*, c.full_name, r.trigger, r.started_at as run_started_at
      from public.payout_attempts a
      join public.payout_runs r on r.id = a.run_id
      left join public.couriers c on c.id = a.courier_id
     where (p_status is null or a.status = p_status)
       and (p_run_id is null or a.run_id = p_run_id)
       and (p_courier_id is null or a.courier_id = p_courier_id)
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               m.id,
               'runId',            m.run_id,
               'trigger',          m.trigger,
               'courierId',        m.courier_id,
               'courierName',      m.full_name,
               'amountCad',        m.amount_cad::float8,
               'runCount',         m.run_count,
               'status',           m.status,
               'reason',           m.reason,
               'error',            m.error,
               'stripeTransferId', m.stripe_transfer_id,
               'createdAt',        m.created_at
             ) order by m.created_at desc, m.id desc)
        from (select * from matched order by created_at desc, id desc limit p_limit offset p_offset) m
    ), '[]'::jsonb),
    'total', (select count(*)::int from matched)
  );
$function$;
--> statement-breakpoint
revoke execute on function public.admin_payout_attempts(text, uuid, uuid, integer, integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_payout_attempts(text, uuid, uuid, integer, integer) to service_role;
--> statement-breakpoint

create function public.admin_payout_runs(p_limit integer default 25, p_offset integer default 0)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           r.id,
               'trigger',      r.trigger,
               'actorName',    pr.full_name,
               'status',       r.status,
               'startedAt',    r.started_at,
               'finishedAt',   r.finished_at,
               'paidCount',    r.paid_count,
               'skippedCount', r.skipped_count,
               'failedCount',  r.failed_count,
               'paidCad',      r.paid_cad::float8,
               'error',        r.error
             ) order by r.started_at desc, r.id desc)
        from (select * from public.payout_runs order by started_at desc, id desc limit p_limit offset p_offset) r
        left join public.profiles pr on pr.id = r.actor_id
    ), '[]'::jsonb),
    'total', (select count(*)::int from public.payout_runs)
  );
$function$;
--> statement-breakpoint
revoke execute on function public.admin_payout_runs(integer, integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_payout_runs(integer, integer) to service_role;
--> statement-breakpoint

-- The figures above the lists.
create function public.admin_payout_insights()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with owed as (
    select d.courier_id, sum(d.earnings_cad) as cad, count(*) as runs, min(d.delivered_at) as oldest_at
      from public.order_deliveries d
     where d.delivered_at is not null and d.paid_out_at is null
     group by d.courier_id
  ),
  owed_acc as (
    select o.*, p.stripe_connect_account_id as account_id
      from owed o left join public.courier_payouts p on p.courier_id = o.courier_id
  ),
  paid30 as (
    select a.courier_id, a.amount_cad
      from public.payout_attempts a
     where a.status = 'paid' and a.created_at >= now() - interval '30 days'
  ),
  last_run as (
    select * from public.payout_runs order by started_at desc, id desc limit 1
  )
  select jsonb_build_object(
    'owedCad',           coalesce((select sum(cad) from owed_acc), 0)::float8,
    'owedCouriers',      (select count(*) from owed_acc)::int,
    'owedRuns',          coalesce((select sum(runs) from owed_acc), 0)::int,
    'oldestUnpaidAt',    (select min(oldest_at) from owed_acc),
    'noAccountCad',      coalesce((select sum(cad) from owed_acc where account_id is null), 0)::float8,
    'noAccountCouriers', (select count(*) from owed_acc where account_id is null)::int,
    'paid30Cad',         coalesce((select sum(amount_cad) from paid30), 0)::float8,
    'paid30Couriers',    (select count(distinct courier_id) from paid30)::int,
    'failed30',          (select count(*) from public.payout_attempts
                           where status = 'failed' and created_at >= now() - interval '30 days')::int,
    'paidAllTimeCad',    coalesce((select sum(amount_cad) from public.payout_attempts where status = 'paid'), 0)::float8,
    'lastRun',           (select jsonb_build_object(
                            'id', id, 'trigger', trigger, 'status', status, 'startedAt', started_at,
                            'finishedAt', finished_at, 'paidCount', paid_count, 'skippedCount', skipped_count,
                            'failedCount', failed_count, 'paidCad', paid_cad::float8)
                            from last_run)
  );
$function$;
--> statement-breakpoint
revoke execute on function public.admin_payout_insights() from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_payout_insights() to service_role;
--> statement-breakpoint

-- Seeing the payouts page is its own permission, separate from running them.
update public.admin_roles
   set permissions = array_append(permissions, 'payouts.view'), updated_at = now()
 where slug in ('owner', 'finance', 'readonly')
   and not ('payouts.view' = any (permissions));
