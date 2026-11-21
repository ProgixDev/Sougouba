-- Administrators manage administrators.
--
-- An admin account could only be made in the database (`profiles.role =
-- 'admin'` by hand). These two functions are the back office's way in and
-- out, each audited in the same transaction as the change. The Auth side —
-- creating the account, banning it on revoke — is an HTTP call the API makes
-- around them (`AdminAccountsService`).
--
-- `AdminGuard` reads `profiles.role` on every request, so a revoke takes
-- effect on the next call, not when a token expires.

-- Gives an account the admin role. Only for an account with no role yet —
-- the API creates a fresh one for each new administrator, so a customer,
-- merchant or courier account is never turned into an admin by accident.
-- Refusals: SGB05 no such profile; SGB06 the account already has a role.
create or replace function public.admin_grant_admin(
  p_actor_id uuid,
  p_user_id uuid,
  p_full_name text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_role text;
begin
  select role::text into v_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'SGB05';
  end if;
  if v_role is not null then
    raise exception 'This account already has a role' using errcode = 'SGB06';
  end if;

  update public.profiles
     set role = 'admin', full_name = p_full_name, updated_at = now()
   where id = p_user_id;

  perform private.admin_audit_write(
    p_actor_id, 'admin.create', 'user'::public.audit_subject, p_user_id, p_full_name, null,
    jsonb_build_object('role', jsonb_build_object('from', null, 'to', 'admin'))
  );
end;
$function$;
--> statement-breakpoint

-- Takes the admin role away. Refusals: SGB05 not an administrator; SGB06 the
-- caller themself, or the last administrator — the back office must never be
-- left with nobody who can open it.
create or replace function public.admin_revoke_admin(
  p_actor_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_name text;
begin
  if p_actor_id = p_user_id then
    raise exception 'You cannot remove your own administrator access' using errcode = 'SGB06';
  end if;

  -- Every admin row locked, so two administrators revoking each other at the
  -- same moment cannot both pass the "someone is left" check.
  perform 1 from public.profiles where role = 'admin' for update;

  select full_name into v_name from public.profiles where id = p_user_id and role = 'admin';
  if not found then
    raise exception 'Not an administrator' using errcode = 'SGB05';
  end if;
  if (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be removed' using errcode = 'SGB06';
  end if;

  update public.profiles set role = null, updated_at = now() where id = p_user_id;

  perform private.admin_audit_write(
    p_actor_id, 'admin.revoke', 'user'::public.audit_subject, p_user_id, v_name, nullif(btrim(p_reason), ''),
    jsonb_build_object('role', jsonb_build_object('from', 'admin', 'to', null))
  );
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_grant_admin(uuid, uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_grant_admin(uuid, uuid, text) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_revoke_admin(uuid, uuid, text) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_revoke_admin(uuid, uuid, text) to service_role;
