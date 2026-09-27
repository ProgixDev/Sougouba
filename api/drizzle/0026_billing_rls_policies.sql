-- A merchant sees their own subscription and Connect status; a courier sees
-- their own payout account. **Neither writes.** Onboarding creates the row
-- through the API, and every status on it is Stripe's answer — not a claim
-- either party gets to make about themselves. A courier who could set
-- `courier_payouts.status = 'paid'` is a courier marking their own invoice
-- settled.
--
-- Write grants on `merchant_subscriptions` were already revoked by `0024`'s
-- column-grant audit; `courier_payouts` is revoked here alongside its policy.
create policy "merchant_subscriptions_select_own" on public.merchant_subscriptions
  for select to authenticated
  using (exists (
    select 1 from public.vendors v
    where v.id = merchant_subscriptions.vendor_id and v.owner_id = (select auth.uid())
  ));
--> statement-breakpoint

create policy "merchant_subscriptions_select_admin" on public.merchant_subscriptions
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "courier_payouts_select_own" on public.courier_payouts
  for select to authenticated using (private.is_courier(courier_id));
--> statement-breakpoint

create policy "courier_payouts_select_admin" on public.courier_payouts
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

revoke insert, update, delete on public.courier_payouts from anon, authenticated;
--> statement-breakpoint

revoke select on public.merchant_subscriptions, public.courier_payouts from anon;
