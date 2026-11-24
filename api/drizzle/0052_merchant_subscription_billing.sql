-- The merchant's monthly subscription (CDC addendum v1.1, §05: 70 $/month, on
-- top of the 12 % commission), billed by Stripe.
--
-- `merchant_subscriptions` has carried `status`, `stripe_subscription_id` and
-- `current_period_end` since the first migration, waiting for this. What it did
-- not have is the Stripe **customer** — the one id that every subscription,
-- invoice and failed payment about a shop hangs off. Webhooks are matched to a
-- shop through it, rather than through metadata a dashboard edit could lose.
--
-- Stripe is the system of record. Everything here is a copy, refreshed from
-- Stripe whenever a webhook arrives or the merchant opens the screen; nothing
-- reads it to decide whether money is owed.

alter table public.merchant_subscriptions
  add column stripe_customer_id text,
  -- When a subscription the merchant cancelled will actually end. Null while it
  -- simply renews.
  add column cancel_at          timestamptz,
  -- What this shop is billed each month. The platform rate can change; a shop
  -- stays on the price it subscribed at until someone moves it.
  add column price_cad          numeric(10, 2);
--> statement-breakpoint

-- One Stripe customer per shop, one shop per Stripe customer: a webhook that
-- matched two rows would update the wrong merchant's standing.
create unique index merchant_subscriptions_stripe_customer_key
  on public.merchant_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;
--> statement-breakpoint

create unique index merchant_subscriptions_stripe_subscription_key
  on public.merchant_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
--> statement-breakpoint

comment on column public.merchant_subscriptions.stripe_customer_id is
  'Stripe Billing customer for the monthly subscription. Not the Connect account, which is how the shop is paid.';
--> statement-breakpoint
comment on column public.merchant_subscriptions.status is
  'Copy of the Stripe subscription''s standing: inactive (never subscribed), active, past_due (a renewal failed), canceled.';
