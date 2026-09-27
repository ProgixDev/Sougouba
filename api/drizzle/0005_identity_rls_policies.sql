-- Own-row access only, everywhere in this migration. `to authenticated`
-- alone would be authentication without authorization (BOLA) — every policy
-- below pairs it with an ownership predicate, and every UPDATE policy
-- carries both USING and WITH CHECK so a row can't be updated into pointing
-- at someone else's id.

-- profiles: read/update your own row. No INSERT policy — rows are created
-- only by the `handle_new_user` trigger (SECURITY DEFINER, bypasses RLS).
-- No DELETE policy — account deletion isn't in scope yet.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
--> statement-breakpoint

-- ⚠️ This policy alone was NOT enough — see `0022_identity_column_privileges.sql`.
-- It correctly scopes the *row*, but RLS cannot scope columns, and Supabase's
-- default grants left `role`, `vendor_id`, `courier_id` and `referred_by`
-- writable: with only this migration applied, any signed-in user could
-- `update profiles set role = 'admin'` over PostgREST. `0022` grants UPDATE on
-- the three columns a user genuinely owns and revokes the rest.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
--> statement-breakpoint

-- addresses: full CRUD, scoped to the owning profile.
create policy "addresses_select_own" on public.addresses
  for select to authenticated
  using ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "addresses_insert_own" on public.addresses
  for insert to authenticated
  with check ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "addresses_update_own" on public.addresses
  for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "addresses_delete_own" on public.addresses
  for delete to authenticated
  using ((select auth.uid()) = profile_id);
--> statement-breakpoint

-- favorite_products / favorite_vendors: read/add/remove your own, never
-- update (a favorite is a boolean fact — you add it or you don't).
create policy "favorite_products_select_own" on public.favorite_products
  for select to authenticated
  using ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "favorite_products_insert_own" on public.favorite_products
  for insert to authenticated
  with check ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "favorite_products_delete_own" on public.favorite_products
  for delete to authenticated
  using ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "favorite_vendors_select_own" on public.favorite_vendors
  for select to authenticated
  using ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "favorite_vendors_insert_own" on public.favorite_vendors
  for insert to authenticated
  with check ((select auth.uid()) = profile_id);
--> statement-breakpoint

create policy "favorite_vendors_delete_own" on public.favorite_vendors
  for delete to authenticated
  using ((select auth.uid()) = profile_id);
