-- Roles and permissions for the back office.
--
-- Every administrator could do everything. Now each one has a role, and a role
-- is a list of permissions (`src/admin/permissions.ts` is the catalogue, and
-- the API checks one on every admin route). Five built-in roles ship here and
-- cannot be edited or deleted; administrators who manage admins can add their
-- own on top.
--
-- One rule holds in every function below: **someone must always be able to
-- manage administrators** (`admins.manage`). Without it, a role edit or a
-- revoke could lock the whole team out of this screen for good.

alter type public.audit_subject add value if not exists 'admin_role';
--> statement-breakpoint

create table public.admin_roles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(name) between 2 and 40),
  description  text not null default '' check (char_length(description) <= 300),
  -- Validated against the catalogue by the API; stored as written.
  permissions  text[] not null default '{}',
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
--> statement-breakpoint
-- Read through the API only, like every other table.
alter table public.admin_roles enable row level security;
--> statement-breakpoint
revoke all on table public.admin_roles from public, anon, authenticated;
--> statement-breakpoint
grant all on table public.admin_roles to service_role;
--> statement-breakpoint

insert into public.admin_roles (slug, name, description, is_system, permissions) values
  ('owner', 'Propriétaire', 'Tous les droits, y compris les administrateurs et les paramètres de la plateforme.', true,
   array['dashboard.view','orders.view','orders.refund','disputes.view','disputes.resolve',
         'courier_issues.view','courier_issues.resolve','vendors.view','vendors.decide',
         'couriers.view','couriers.decide','users.view','users.block','support.view','support.reply',
         'moderation.view','moderation.act','specialties.view','specialties.manage',
         'settings.view','settings.manage','audit.view','admins.view','admins.manage','payouts.run']),
  ('operations', 'Opérations', 'Dossiers des commerçants et des livreurs, commandes, incidents de livraison, spécialités.', true,
   array['dashboard.view','orders.view','disputes.view','courier_issues.view','courier_issues.resolve',
         'vendors.view','vendors.decide','couriers.view','couriers.decide','users.view',
         'specialties.view','specialties.manage']),
  ('support', 'Support client', 'Assistance, litiges, blocage de comptes et modération des contenus.', true,
   array['dashboard.view','orders.view','disputes.view','disputes.resolve','vendors.view','couriers.view',
         'users.view','users.block','support.view','support.reply','moderation.view','moderation.act']),
  ('finance', 'Finance', 'Commandes, remboursements, virements des livreurs, lecture des paramètres et du journal.', true,
   array['dashboard.view','orders.view','orders.refund','disputes.view','vendors.view','couriers.view',
         'settings.view','audit.view','payouts.run']),
  ('readonly', 'Lecture seule', 'Consulte tout le tableau de bord, sans rien pouvoir modifier.', true,
   array['dashboard.view','orders.view','disputes.view','courier_issues.view','vendors.view','couriers.view',
         'users.view','support.view','moderation.view','specialties.view','settings.view','audit.view','admins.view']);
--> statement-breakpoint

alter table public.profiles
  add column admin_role_id uuid references public.admin_roles (id) on delete restrict;
--> statement-breakpoint

-- Every administrator existing today keeps doing what they did: everything.
update public.profiles
   set admin_role_id = (select id from public.admin_roles where slug = 'owner')
 where role = 'admin';
--> statement-breakpoint

-- An administrator always has a role; nobody else has one.
alter table public.profiles
  add constraint profiles_admin_role_matches
  check ((role = 'admin') = (admin_role_id is not null));
--> statement-breakpoint

-- The rule above, checked after a change and before it commits.
create or replace function private.assert_admin_manager_remains()
returns void
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
      from public.profiles p
      join public.admin_roles r on r.id = p.admin_role_id
     where p.role = 'admin' and 'admins.manage' = any (r.permissions)
  ) then
    raise exception 'At least one administrator must keep the right to manage administrators'
      using errcode = 'SGB10';
  end if;
end;
$function$;
--> statement-breakpoint
revoke execute on function private.assert_admin_manager_remains() from public, anon, authenticated;
--> statement-breakpoint

-- ── administrators ──────────────────────────────────────────────────────────

-- 0042's grant, now with the role. The old three-argument form goes: a new
-- administrator without a role would break the constraint above anyway.
drop function if exists public.admin_grant_admin(uuid, uuid, text);
--> statement-breakpoint
create or replace function public.admin_grant_admin(
  p_actor_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_role_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_role text;
  v_role_name text;
begin
  select name into v_role_name from public.admin_roles where id = p_role_id;
  if not found then
    raise exception 'Role not found' using errcode = 'SGB05';
  end if;

  select role::text into v_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'SGB05';
  end if;
  if v_role is not null then
    raise exception 'This account already has a role' using errcode = 'SGB06';
  end if;

  update public.profiles
     set role = 'admin', admin_role_id = p_role_id, full_name = p_full_name, updated_at = now()
   where id = p_user_id;

  perform private.admin_audit_write(
    p_actor_id, 'admin.create', 'user'::public.audit_subject, p_user_id, p_full_name, null,
    jsonb_build_object('role', jsonb_build_object('from', null, 'to', v_role_name))
  );
end;
$function$;
--> statement-breakpoint

-- Moves an administrator to another role. Refusals: SGB05 not an
-- administrator, or no such role; SGB10 nobody could manage admins after.
create or replace function public.admin_set_admin_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_name text;
  v_from text;
  v_to text;
begin
  -- Every admin row locked: two role changes at once cannot both pass the check.
  perform 1 from public.profiles where role = 'admin' for update;

  select p.full_name, r.name into v_name, v_from
    from public.profiles p join public.admin_roles r on r.id = p.admin_role_id
   where p.id = p_user_id and p.role = 'admin';
  if not found then
    raise exception 'Not an administrator' using errcode = 'SGB05';
  end if;
  select name into v_to from public.admin_roles where id = p_role_id;
  if not found then
    raise exception 'Role not found' using errcode = 'SGB05';
  end if;

  update public.profiles set admin_role_id = p_role_id, updated_at = now() where id = p_user_id;
  perform private.assert_admin_manager_remains();

  perform private.admin_audit_write(
    p_actor_id, 'admin.role_change', 'user'::public.audit_subject, p_user_id, v_name, null,
    jsonb_build_object('role', jsonb_build_object('from', v_from, 'to', v_to))
  );
end;
$function$;
--> statement-breakpoint

-- 0042's revoke: the "last administrator" check becomes "someone can still
-- manage administrators", which is the thing that actually matters.
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
  v_role text;
begin
  if p_actor_id = p_user_id then
    raise exception 'You cannot remove your own administrator access' using errcode = 'SGB06';
  end if;

  perform 1 from public.profiles where role = 'admin' for update;

  select p.full_name, r.name into v_name, v_role
    from public.profiles p join public.admin_roles r on r.id = p.admin_role_id
   where p.id = p_user_id and p.role = 'admin';
  if not found then
    raise exception 'Not an administrator' using errcode = 'SGB05';
  end if;

  update public.profiles set role = null, admin_role_id = null, updated_at = now() where id = p_user_id;
  perform private.assert_admin_manager_remains();

  perform private.admin_audit_write(
    p_actor_id, 'admin.revoke', 'user'::public.audit_subject, p_user_id, v_name, nullif(btrim(p_reason), ''),
    jsonb_build_object('role', jsonb_build_object('from', v_role, 'to', null))
  );
end;
$function$;
--> statement-breakpoint

-- ── custom roles ────────────────────────────────────────────────────────────

-- Creates (`p_id` null) or edits a custom role. Built-in roles are refused
-- (SGB06), an unknown id is SGB05, a taken slug is 23505, and an edit that
-- would leave nobody able to manage admins is SGB10.
create or replace function public.admin_role_save(
  p_actor_id uuid,
  p_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_permissions text[]
)
returns public.admin_roles
language plpgsql
set search_path = ''
as $function$
declare
  v_before public.admin_roles;
  v_row public.admin_roles;
begin
  if p_id is null then
    insert into public.admin_roles (slug, name, description, permissions)
    values (p_slug, p_name, coalesce(p_description, ''), p_permissions)
    returning * into v_row;

    perform private.admin_audit_write(
      p_actor_id, 'role.create', 'admin_role'::public.audit_subject, v_row.id, v_row.name, null,
      jsonb_build_object('permissions', jsonb_build_object('from', null, 'to', to_jsonb(v_row.permissions)))
    );
    return v_row;
  end if;

  perform 1 from public.profiles where role = 'admin' for update;
  select * into v_before from public.admin_roles where id = p_id for update;
  if not found then
    raise exception 'Role not found' using errcode = 'SGB05';
  end if;
  if v_before.is_system then
    raise exception 'Built-in roles cannot be edited' using errcode = 'SGB06';
  end if;

  update public.admin_roles
     set name = p_name, description = coalesce(p_description, ''), permissions = p_permissions, updated_at = now()
   where id = p_id
  returning * into v_row;
  perform private.assert_admin_manager_remains();

  perform private.admin_audit_write(
    p_actor_id, 'role.update', 'admin_role'::public.audit_subject, v_row.id, v_row.name, null,
    jsonb_build_object(
      'name', jsonb_build_object('from', v_before.name, 'to', v_row.name),
      'permissions', jsonb_build_object('from', to_jsonb(v_before.permissions), 'to', to_jsonb(v_row.permissions))
    )
  );
  return v_row;
end;
$function$;
--> statement-breakpoint

-- Deletes a custom role nobody has. Refusals: SGB05 no such role; SGB06 a
-- built-in role, or one still given to an administrator.
create or replace function public.admin_role_delete(
  p_actor_id uuid,
  p_id uuid
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_role public.admin_roles;
begin
  select * into v_role from public.admin_roles where id = p_id for update;
  if not found then
    raise exception 'Role not found' using errcode = 'SGB05';
  end if;
  if v_role.is_system then
    raise exception 'Built-in roles cannot be deleted' using errcode = 'SGB06';
  end if;
  if exists (select 1 from public.profiles where admin_role_id = p_id) then
    raise exception 'This role is still given to an administrator' using errcode = 'SGB06';
  end if;

  delete from public.admin_roles where id = p_id;

  perform private.admin_audit_write(
    p_actor_id, 'role.delete', 'admin_role'::public.audit_subject, p_id, v_role.name, null,
    jsonb_build_object('permissions', jsonb_build_object('from', to_jsonb(v_role.permissions), 'to', null))
  );
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_grant_admin(uuid, uuid, text, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_grant_admin(uuid, uuid, text, uuid) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_set_admin_role(uuid, uuid, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_set_admin_role(uuid, uuid, uuid) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_role_save(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_role_save(uuid, uuid, text, text, text, text[]) to service_role;
--> statement-breakpoint
revoke execute on function public.admin_role_delete(uuid, uuid) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_role_delete(uuid, uuid) to service_role;
