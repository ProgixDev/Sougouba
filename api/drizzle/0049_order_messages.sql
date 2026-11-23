-- Chat between the shopper and the courier carrying their order.
--
-- The tracking card's "Message" button opened the phone's SMS app on the
-- courier's real number — a number the shopper kept long after the order. The
-- conversation now lives here instead, scoped to one order: it opens once a
-- courier has accepted the run and stops taking messages when the order is
-- delivered or cancelled. Who wrote a message is a role, not a user id: the
-- order already names its customer, and its delivery row names its courier.

create table public.order_messages (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'courier')),
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  -- When the other side first read it. Null is unread.
  read_at     timestamptz
);
--> statement-breakpoint
create index order_messages_order_idx on public.order_messages (order_id, created_at);
--> statement-breakpoint
create index order_messages_unread_idx on public.order_messages (order_id, sender_role) where read_at is null;
--> statement-breakpoint

-- Read and written through the API only, like every other table.
alter table public.order_messages enable row level security;
--> statement-breakpoint
revoke all on table public.order_messages from public, anon, authenticated;
--> statement-breakpoint
grant all on table public.order_messages to service_role;
