-- Merchant statements: what a shop sold in a month, what Sougouba keeps, what
-- Stripe has already sent the shop, and what is still owed to it.
--
-- Until now that last figure existed nowhere. A shop that has not finished its
-- Stripe setup still sells — the payment then stays whole on Sougouba's Stripe
-- balance, "settled manually" — and nothing recorded what manual settlement
-- would have to pay. A statement is that record.
--
-- Two parts.
--
-- 1. Three columns on `orders`, written when the order is paid, so a statement
--    can be drawn months later without asking what the commission rate was back
--    then or whether Stripe split that particular payment:
--      commission_rate    the rate in force at checkout
--      commission_cad     Sougouba's commission on this order
--      merchant_paid_cad  what Stripe sent the shop at payment — the order total
--                         less the commission when the payment was split, zero
--                         when the shop had no Stripe account and it was not
--    All three are null on an order with no payment behind it (seeded history):
--    such an order moved no money and appears on no statement.
--
-- 2. `merchant_statements`: one row per shop per month, frozen. The totals are
--    stored, not recomputed — a statement someone was sent must still say the
--    same thing after a later refund, which shows up on the month it happened.

alter table public.orders
  add column commission_rate   numeric(4, 3),
  add column commission_cad    numeric(10, 2),
  add column merchant_paid_cad numeric(10, 2);
--> statement-breakpoint

-- Orders paid before this migration. No shop has ever held a Stripe account, so
-- no payment was ever split: the commission is the rate on the goods, and
-- nothing has been sent to anyone.
update public.orders o
   set commission_rate   = s.commission_rate,
       commission_cad    = round(o.subtotal_cad * s.commission_rate, 2),
       merchant_paid_cad = 0
  from public.platform_settings s
 where s.id = 1
   and o.stripe_payment_intent_id is not null
   and o.commission_cad is null;
--> statement-breakpoint

comment on column public.orders.commission_cad is
  'Sougouba''s commission on this order, fixed at checkout. Null on an order with no payment behind it.';
--> statement-breakpoint
comment on column public.orders.merchant_paid_cad is
  'What Stripe sent the shop when the order was paid (total less commission), or 0 when the payment was not split.';
--> statement-breakpoint

create sequence public.merchant_statement_number_seq as bigint;
--> statement-breakpoint

create table public.merchant_statements (
  id           uuid primary key default gen_random_uuid(),
  -- Printed as RM-000123. Unique and rising, not gap-free, like receipt numbers.
  number       bigint not null default nextval('public.merchant_statement_number_seq'),
  vendor_id    uuid not null references public.vendors (id) on delete cascade,
  -- First day of the month the statement covers, and of the month after it.
  period_start date not null,
  period_end   date not null,
  -- The figures as issued, and the orders and refunds they were added up from.
  totals       jsonb not null,
  lines        jsonb not null,
  created_at   timestamptz not null default now(),
  emailed_at   timestamptz,
  constraint merchant_statements_number_key unique (number),
  -- One statement per shop per month: generating twice must find the first.
  constraint merchant_statements_vendor_period_key unique (vendor_id, period_start),
  constraint merchant_statements_period_check check (period_end > period_start)
);
--> statement-breakpoint

alter sequence public.merchant_statement_number_seq owned by public.merchant_statements.number;
--> statement-breakpoint

create index merchant_statements_vendor_idx on public.merchant_statements (vendor_id, period_start desc);
--> statement-breakpoint

-- Read and written by the API alone. RLS on with no policy, and no grant to the
-- client roles: a shop reads its statements through the API, which knows whose
-- they are.
alter table public.merchant_statements enable row level security;
--> statement-breakpoint
revoke all on table public.merchant_statements from public, anon, authenticated;
--> statement-breakpoint
grant all on table public.merchant_statements to service_role;
--> statement-breakpoint
revoke all on sequence public.merchant_statement_number_seq from public, anon, authenticated;
--> statement-breakpoint
grant usage, select on sequence public.merchant_statement_number_seq to service_role;
