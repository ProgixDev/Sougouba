-- Applied via MCP `apply_migration` as `merchant_registration_documents` (2026-09-27).
--
-- The client's registration list (2026-09-27): legal name, address, NEQ or proof
-- of registration, TPS/TVQ numbers, a valid MAPAQ permit, the authorised
-- officer's ID, and a business bank account — the last either through Stripe
-- Connect or an official document from the bank.

alter table public.vendor_registrations
  alter column neq drop not null,
  add column legal_name text,
  add column gst_number text,
  add column qst_number text,
  add column mapaq_expires_on date,
  add column payout_method text,
  add column bank_document_path text,
  add constraint vendor_registrations_payout_method_check
    check (payout_method in ('stripe', 'bank_document')),
  -- "Paid by bank document" with no document is a file nobody can pay.
  add constraint vendor_registrations_bank_document_check
    check (payout_method is distinct from 'bank_document' or bank_document_path is not null);
--> statement-breakpoint

-- Identity papers and bank letters: bounded size, and only formats an
-- administrator can open in a browser.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/heic']
 where id = 'merchant-documents';
--> statement-breakpoint

-- Merchants no longer write to this bucket at all. The old policy let an owner
-- read, overwrite and delete anything under their shop's folder — including,
-- after approval, the very permit the approval was granted on. Uploads now go
-- through signed upload URLs the API issues (service role, a path it chose),
-- and reads through signed URLs it issues to administrators. The bucket was
-- empty when this landed, so nothing depended on the old policy.
drop policy if exists merchant_documents_own_folder on storage.objects;
--> statement-breakpoint

drop function if exists public.vendor_apply(
  uuid, text, text, text, text, text, text, text, double precision, double precision,
  integer, boolean, text, text, text, text, jsonb, text[]
);
--> statement-breakpoint

create function public.vendor_apply(
  p_owner_id uuid,
  p_slug_base text,
  p_name text,
  p_vendor_type text,
  p_specialty_fr text,
  p_city text,
  p_street text,
  p_postal_code text,
  p_lat double precision,
  p_lng double precision,
  p_delivery_eta_min integer,
  p_is_halal_certified boolean,
  p_legal_name text,
  p_neq text,
  p_gst_number text,
  p_qst_number text,
  p_contact_name text,
  p_contact_phone text,
  p_mapaq_number text,
  p_mapaq_expires_on date,
  p_payout_method text,
  p_id_document_path text,
  p_business_number_document_path text,
  p_mapaq_document_path text,
  p_bank_document_path text,
  p_default_hours jsonb,
  p_default_sections text[]
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_id     uuid := gen_random_uuid();
  v_slug   text;
  v_n      integer := 1;
  v_prefix text := 'applications/' || p_owner_id::text || '/';
  v_doc    record;
begin
  -- Every document must be one this owner actually uploaded, through a URL the
  -- API issued for their own folder. Checked here, in the same transaction as
  -- the insert, so a path cannot be accepted and then turn out to be empty.
  for v_doc in
    select * from (values
      ('id', p_id_document_path),
      ('business_number', p_business_number_document_path),
      ('mapaq', p_mapaq_document_path),
      ('bank', p_bank_document_path)
    ) as d(kind, path)
    where d.path is not null
  loop
    if not starts_with(v_doc.path, v_prefix)
       or not exists (
         select 1 from storage.objects o
          where o.bucket_id = 'merchant-documents' and o.name = v_doc.path
       ) then
      raise exception 'document_not_found:%', v_doc.kind using errcode = '22023';
    end if;
  end loop;

  v_slug := coalesce(nullif(p_slug_base, ''), v_id::text);
  while exists (select 1 from public.vendors where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := coalesce(nullif(p_slug_base, ''), v_id::text) || '-' || v_n;
  end loop;

  insert into public.vendors (
    id, slug, name, vendor_type, specialty_fr, logo_url, cover_url,
    city, neighborhood, address_street, address_postal_code, address_lat, address_lng,
    delivery_eta_min, is_halal_certified, owner_id, status
  ) values (
    v_id, v_slug, p_name, p_vendor_type::public.vendor_type, p_specialty_fr, '', '',
    p_city, p_city, p_street, p_postal_code, p_lat, p_lng,
    p_delivery_eta_min, p_is_halal_certified, p_owner_id, 'pending'
  );

  insert into public.vendor_registrations (
    vendor_id, legal_name, neq, gst_number, qst_number,
    contact_name, contact_phone, mapaq_number, mapaq_expires_on, payout_method,
    id_document_path, business_number_document_path, mapaq_document_path, bank_document_path
  ) values (
    v_id, p_legal_name, p_neq, p_gst_number, p_qst_number,
    p_contact_name, p_contact_phone, p_mapaq_number, p_mapaq_expires_on, p_payout_method,
    p_id_document_path, p_business_number_document_path, p_mapaq_document_path, p_bank_document_path
  );

  insert into public.vendor_hours (vendor_id, day, open, close, closed)
  select v_id, (e ->> 'day')::int, e ->> 'open', e ->> 'close', (e ->> 'closed')::boolean
    from jsonb_array_elements(p_default_hours) as e;

  insert into public.vendor_sections (vendor_id, name_fr, position)
  select v_id, name, ordinality - 1
    from unnest(p_default_sections) with ordinality as t(name, ordinality);

  update public.profiles set vendor_id = v_id, updated_at = now() where id = p_owner_id;

  return v_id;
end;
$function$;
--> statement-breakpoint

revoke execute on function public.vendor_apply(
  uuid, text, text, text, text, text, text, text, double precision, double precision,
  integer, boolean, text, text, text, text, text, text, text, date, text, text, text, text, text, jsonb, text[]
) from public, anon, authenticated;
grant execute on function public.vendor_apply(
  uuid, text, text, text, text, text, text, text, double precision, double precision,
  integer, boolean, text, text, text, text, text, text, text, date, text, text, text, text, text, jsonb, text[]
) to service_role;
