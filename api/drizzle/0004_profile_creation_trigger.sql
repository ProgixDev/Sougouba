-- Creates the matching `public.profiles` row the moment Supabase Auth creates
-- an `auth.users` row — mirrors the mock's `authApi.mockSignUp`, which always
-- built a full `User` in the same call as the account. `role` starts null,
-- exactly like the mock: choosing customer/business/courier is a separate,
-- later step (`PATCH /me/role`, Phase 1's NestJS work).
--
-- Deliberately does NOT resolve a referral code here, even though
-- `raw_user_meta_data` could carry one from sign-up. `referralCodeFor`
-- (data/loyalty.ts in the mobile app) is a hash function with real 32-bit
-- overflow semantics (`Math.imul`) — porting it into plpgsql risks a subtly
-- different result from the TypeScript original, and the two would then
-- disagree about whose code is whose. Referral capture instead goes through
-- `POST /me/referral` once the account exists and NestJS (the one place that
-- hash function lives) can resolve it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, member_since)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.created_at
  );
  return new;
end;
$$;
--> statement-breakpoint

-- A trigger function can only ever be invoked by the trigger machinery
-- (calling it via `select public.handle_new_user()` errors — there is no
-- `new`/`old` outside a trigger context), but revoking direct EXECUTE from
-- every role except the definer is cheap, correct hygiene for any
-- SECURITY DEFINER function sitting in the exposed `public` schema.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
--> statement-breakpoint

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
