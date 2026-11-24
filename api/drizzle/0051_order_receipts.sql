-- Receipts: a number for every order, and the time its receipt was last emailed.
--
-- The receipt itself is not stored. An order already snapshots everything one
-- prints — line names and prices, both taxes, the delivery fee, the address —
-- so the API renders the document from the order each time it is asked for
-- (`src/orders/receipts/`). What an order did not have is a number that names
-- exactly one receipt: the `#A1B2` reference the app shows is four hex
-- characters hashed from the id, and two orders can share it.
--
-- The number comes from the column's own default, not from `order_place`: every
-- path that writes an order gets one without having to remember to ask, and the
-- function that takes the money is left exactly as it was.
--
-- ⚠️ A sequence, so the numbers are unique and rising but **not gap-free**: a
-- checkout that rolls back after the insert (an item sold out, a coupon used
-- up) keeps the number it drew. Nothing here needs them contiguous. If an
-- accountant ever does, that is a counter table and a lock, not this.

create sequence public.order_receipt_number_seq as bigint;
--> statement-breakpoint

alter table public.orders
  add column receipt_number     bigint,
  add column receipt_emailed_at timestamptz;
--> statement-breakpoint

-- Existing orders are numbered in the order they were placed, so the oldest
-- order holds R-000001 rather than whichever row the table happens to store first.
with numbered as (
  select id, row_number() over (order by created_at, id) as n
    from public.orders
)
update public.orders o
   set receipt_number = numbered.n
  from numbered
 where o.id = numbered.id;
--> statement-breakpoint

-- Continue after the last number handed out; start at 1 on an empty table.
select setval(
  'public.order_receipt_number_seq',
  greatest((select coalesce(max(receipt_number), 0) from public.orders), 1),
  (select count(*) > 0 from public.orders)
);
--> statement-breakpoint

alter table public.orders
  alter column receipt_number set default nextval('public.order_receipt_number_seq'),
  alter column receipt_number set not null,
  add constraint orders_receipt_number_key unique (receipt_number);
--> statement-breakpoint

alter sequence public.order_receipt_number_seq owned by public.orders.receipt_number;
--> statement-breakpoint

comment on column public.orders.receipt_number is
  'Sequential receipt number, printed as R-000123. Unique and rising, not gap-free.';
--> statement-breakpoint
comment on column public.orders.receipt_emailed_at is
  'When the receipt was last emailed to the shopper. Null until a send succeeds.';
--> statement-breakpoint

-- Orders are written by the API alone, as service_role. Supabase's default
-- privileges grant every new object in `public` to anon and authenticated too;
-- nothing but the API's own inserts has any business drawing from this.
revoke all on sequence public.order_receipt_number_seq from public, anon, authenticated;
--> statement-breakpoint
grant usage, select on sequence public.order_receipt_number_seq to service_role;
--> statement-breakpoint

-- The back office resends a receipt ("I never got it"). The API sends the mail
-- first — it cannot be part of a transaction — then calls this, which writes
-- the send time and the audit entry together, like every other audited action.
-- Refusal: SGB05 no such order.
create function public.admin_receipt_resent(
  p_admin_id uuid,
  p_order_id uuid,
  p_sent_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_order  public.orders;
  v_number text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'SGB05';
  end if;

  update public.orders set receipt_emailed_at = p_sent_at where id = p_order_id;

  -- The label the API prints (`formatReceiptNumber`): six digits at least.
  -- `greatest`, because `lpad` to a fixed 6 would cut a seven-digit number short.
  v_number := v_order.receipt_number::text;
  perform private.admin_audit_write(
    p_admin_id, 'order.receipt_resend', 'order'::public.audit_subject, p_order_id,
    'R-' || lpad(v_number, greatest(6, length(v_number)), '0'), null,
    jsonb_build_object('receipt_emailed_at', jsonb_build_object('from', v_order.receipt_emailed_at, 'to', p_sent_at))
  );
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_receipt_resent(uuid, uuid, timestamptz) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_receipt_resent(uuid, uuid, timestamptz) to service_role;
