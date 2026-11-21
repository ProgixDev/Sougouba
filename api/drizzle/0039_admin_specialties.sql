-- The back office manages the shop specialties list.
--
-- `0033` seeded the list and said "the back office owns it from here on", but
-- no back-office route could write it: adding a cuisine or fixing a spelling
-- meant a migration. This is the one write path, audited like every other
-- admin decision.
alter type public.audit_subject add value if not exists 'specialty';
--> statement-breakpoint

-- Creates (`p_id` null) or edits one specialty, and records it — one
-- transaction, so there is never an entry without its change or the reverse.
--
-- **A rename reaches the shops.** `vendors.specialty_fr` is a copy of the name
-- taken at registration (see `0033`); without this, fixing "Cuisine Ivoirienne"
-- would leave every shop that chose it showing the old spelling forever.
-- Retiring an entry does *not* touch them — "retired, not deleted: shops that
-- chose it keep their line" — it only stops it being offered.
--
-- Refusals: SGB05 when `p_id` names no specialty; 23505 (unique slug) when a
-- new entry's slug is taken.
create or replace function public.admin_specialty_save(
  p_admin_id uuid,
  p_id uuid,
  p_vendor_type public.vendor_type,
  p_slug text,
  p_name_fr text,
  p_name_en text,
  p_position integer,
  p_is_active boolean
)
returns public.specialties
language plpgsql
set search_path = ''
as $function$
declare
  v_before public.specialties;
  v_row public.specialties;
  v_changes jsonb := '{}'::jsonb;
begin
  if p_id is null then
    insert into public.specialties (vendor_type, slug, name_fr, name_en, position, is_active)
    values (p_vendor_type, p_slug, p_name_fr, p_name_en, p_position, p_is_active)
    returning * into v_row;

    perform private.admin_audit_write(
      p_admin_id, 'specialty.create', 'specialty'::public.audit_subject, v_row.id, v_row.name_fr, null,
      jsonb_build_object('vendor_type', jsonb_build_object('from', null, 'to', v_row.vendor_type))
    );
    return v_row;
  end if;

  select * into v_before from public.specialties where id = p_id for update;
  if not found then
    raise exception 'Specialty not found' using errcode = 'SGB05';
  end if;

  -- The type is not editable: a shop's specialty must stay in its own list.
  update public.specialties
     set name_fr = p_name_fr,
         name_en = p_name_en,
         position = p_position,
         is_active = p_is_active,
         updated_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.name_fr <> v_before.name_fr then
    update public.vendors set specialty_fr = v_row.name_fr, updated_at = now() where specialty_id = p_id;
    v_changes := v_changes || jsonb_build_object('name_fr', jsonb_build_object('from', v_before.name_fr, 'to', v_row.name_fr));
  end if;
  if v_row.name_en <> v_before.name_en then
    v_changes := v_changes || jsonb_build_object('name_en', jsonb_build_object('from', v_before.name_en, 'to', v_row.name_en));
  end if;
  if v_row.position <> v_before.position then
    v_changes := v_changes || jsonb_build_object('position', jsonb_build_object('from', v_before.position, 'to', v_row.position));
  end if;
  if v_row.is_active <> v_before.is_active then
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('from', v_before.is_active, 'to', v_row.is_active));
  end if;

  perform private.admin_audit_write(
    p_admin_id, 'specialty.update', 'specialty'::public.audit_subject, v_row.id, v_row.name_fr, null, v_changes
  );
  return v_row;
end;
$function$;
--> statement-breakpoint

revoke execute on function public.admin_specialty_save(uuid, uuid, public.vendor_type, text, text, text, integer, boolean)
  from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_specialty_save(uuid, uuid, public.vendor_type, text, text, text, integer, boolean)
  to service_role;
