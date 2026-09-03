-- A shopper reads their own ledger and nothing else. Every movement is written
-- by the API as a consequence of an order being paid for or delivered, never
-- because a client asked — so there is no write policy for anyone, and the
-- append-only ledger stays append-only.
create policy "loyalty_transactions_select_own" on public.loyalty_transactions
  for select to authenticated
  using (customer_id = (select auth.uid()));
--> statement-breakpoint

revoke insert, update, delete on public.loyalty_transactions from anon, authenticated;
--> statement-breakpoint

revoke select on public.loyalty_transactions from anon;
--> statement-breakpoint

-- A coupon's existence is not a secret from a signed-in shopper — they are
-- meant to type the code in — but the *terms* are what the API applies, and a
-- readable table lets any client enumerate every live promotion, including ones
-- scoped to a single shop and ones that have not started yet. So no read policy
-- either: a code is validated by asking the API, which answers about one code
-- at a time and says why it was refused.
revoke insert, update, delete on public.coupons, public.coupon_redemptions from anon, authenticated;
--> statement-breakpoint

revoke select on public.coupons, public.coupon_redemptions from anon, authenticated;
--> statement-breakpoint

-- `platform_settings` holds the commission rate and monthly subscription fee
-- alongside the loyalty rates. The loyalty half is public knowledge (the app
-- shows "100 points = 1 $"); the monetization half is a commercial term between
-- the platform and its merchants. RLS cannot split a row by column, so the whole
-- row stays server-side and `GET /me/loyalty/balance` hands out exactly the two
-- rates the app needs to render a wallet.
revoke insert, update, delete on public.platform_settings from anon, authenticated;
--> statement-breakpoint

revoke select on public.platform_settings from anon, authenticated;
