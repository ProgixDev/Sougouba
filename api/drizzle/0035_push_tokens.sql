-- Push notifications: one row per device that may be notified.
--
-- Delivery goes through Expo's push service, which forwards to FCM on Android
-- and APNs on iOS — so `token` is an Expo push token, not a raw FCM/APNs one.
--
-- **The notification switches live on the device row, not on the account.**
-- The app's own preferences store is per device (persisted locally, reset on
-- sign-out), and that is also how phones themselves treat notification
-- settings: muting promotions on a tablet should not mute them on the phone.
-- It also means one query answers "who gets this, in which language, and do
-- they want it" — which matters on a host where every round trip to the
-- database costs most of a second.
--
-- `token` is the key, not `(user_id, token)`: a token identifies a device, and
-- a device signed into a second account must stop receiving the first one's
-- orders. Registering upserts on the token and so moves it.

create table public.push_tokens (
  token            text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id          uuid not null references auth.users (id) on delete cascade,
  platform         text not null check (platform in ('ios', 'android')),
  -- The language the device last showed. A push is rendered on the server,
  -- so it has to be told which one.
  locale           text not null default 'fr' check (locale in ('fr', 'en')),
  order_updates    boolean not null default true,
  delivery_alerts  boolean not null default true,
  promotions       boolean not null default false,
  new_vendors      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
--> statement-breakpoint

create index push_tokens_user_id_idx on public.push_tokens (user_id);
--> statement-breakpoint

-- Service role only, like `email_verification_codes`: RLS on with no policies
-- and the grants revoked. A token is enough to send a stranger notifications.
alter table public.push_tokens enable row level security;
--> statement-breakpoint
revoke all on table public.push_tokens from public, anon, authenticated;
