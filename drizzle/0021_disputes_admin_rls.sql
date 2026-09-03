-- The `admin` role finally gets a definition in the database, and the two
-- tables Phase 6 opens up get their policies.
--
-- Note what `is_admin` is *not*: it is not a claim on the JWT. Supabase can put
-- custom claims in a token, but a token outlives a role change — an
-- administrator whose access is revoked would keep it until their session
-- expired. Reading `profiles.role` costs one indexed lookup and revocation is
-- immediate.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;
--> statement-breakpoint

grant execute on function private.is_admin() to authenticated;
--> statement-breakpoint

-- A courier's report is visible to the courier who wrote it and to the shopper
-- whose order it concerns — they are the one waiting at the other end of it.
-- The merchant is deliberately excluded: "customer_absent" is about the
-- shopper's door, not about the shop.
create policy "courier_issues_select_involved" on public.courier_issues
  for select to authenticated
  using (
    private.owns_order_as_customer(order_id)
    or exists (
      select 1 from public.order_deliveries d
      join public.couriers c on c.id = d.courier_id
      where d.order_id = courier_issues.order_id and c.user_id = (select auth.uid())
    )
  );
--> statement-breakpoint

revoke insert, update, delete on public.courier_issues from anon, authenticated;
--> statement-breakpoint

revoke select on public.courier_issues from anon;
--> statement-breakpoint

-- Admin read access, added as a *second* policy on each table rather than by
-- widening the existing ones. Postgres ORs permissive policies together, so
-- every owner rule stays exactly as it was, and the admin grant can be read —
-- and revoked — on its own. Widening `orders_select_own` to "…or an admin"
-- would have buried a platform-wide grant inside a rule about ownership.
create policy "orders_select_admin" on public.orders
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "disputes_select_admin" on public.disputes
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "courier_issues_select_admin" on public.courier_issues
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "vendors_select_admin" on public.vendors
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "couriers_select_admin" on public.couriers
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

-- The registration paperwork an administrator actually has to read to approve a
-- shop (Phase 8), and the insurance policy behind a motorised courier.
create policy "vendor_registrations_select_admin" on public.vendor_registrations
  for select to authenticated using (private.is_admin());
--> statement-breakpoint

create policy "courier_insurance_select_admin" on public.courier_insurance
  for select to authenticated using (private.is_admin());
