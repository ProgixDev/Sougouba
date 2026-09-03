-- Closes a privilege escalation open since Phase 1, found by running the attack
-- while verifying Phase 6's admin boundary. Any signed-in user could run
--
--     update profiles set role = 'admin' where id = auth.uid()
--
-- successfully, over PostgREST, and become an administrator. Verified against
-- this database: the update succeeded and the role stuck.
--
-- Exactly the shape of the vendor self-approval that `0009` fixed, on a table
-- that was not re-audited when that lesson was learned: `profiles_update_own`
-- (from `0005`) correctly allows a user to edit their own row, RLS has no way
-- to say "this row except four columns", and Supabase's default grants hand
-- `authenticated` table-wide UPDATE on all ten. The policy was the only gate,
-- and it was the wrong kind of gate.
--
-- It was survivable while `role` only chose a home screen. Phase 6 makes it
-- critical: an administrator resolves other people's disputes and issues Stripe
-- refunds. `vendor_id` and `courier_id` were the same hole one step down —
-- repointing them at another merchant's shop is how you read their orders.

-- A user edits their name and their avatar. Everything else about who they are
-- is the server's to set: `role` through `PATCH /me/role` (one-way, three
-- consumer values), `vendor_id`/`courier_id` when a registration is created,
-- `referred_by` once at sign-up and never again.
revoke insert, update, delete on public.profiles from anon, authenticated;
--> statement-breakpoint

grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;
--> statement-breakpoint

-- Rows are created only by the `handle_new_user` trigger (SECURITY DEFINER, so
-- unaffected by this revoke), and account deletion is not in scope — so INSERT
-- and DELETE stay revoked outright rather than column-restricted.
--
-- `addresses`, `favorite_products` and `favorite_vendors` are deliberately left
-- alone: every column on them is genuinely the user's own to write, which is
-- why `0005`'s policies are sufficient there and no column list is needed.
revoke select on public.profiles from anon;
