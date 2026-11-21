-- Blocking an account from the back office, and the audit line that records it.
--
-- Merchants and couriers could be suspended; a customer could not be stopped at
-- all. The block itself is Supabase Auth's ban (`ban_duration` through the
-- admin API), which refuses every new sign-in and token refresh — email code,
-- Google and Apple alike. It lives in `auth.users`, so this migration does not
-- touch it; what it adds is the audit trail every other admin action has.
--
-- `user` joins the audit subjects. Added on its own: a new enum value cannot be
-- used in the transaction that adds it, and nothing below uses it until called.
alter type public.audit_subject add value if not exists 'user';
--> statement-breakpoint

-- Records one block or unblock. Called by the API right after the ban is
-- applied or lifted through Auth; if this write fails, the API reverts the ban
-- so no block goes unlogged. (They cannot share a transaction: the ban is an
-- HTTP call to Supabase Auth, not SQL.)
create or replace function public.admin_record_user_block(
  p_admin_id uuid,
  p_user_id uuid,
  p_blocked boolean,
  p_reason text,
  p_label text
)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  perform private.admin_audit_write(
    p_admin_id,
    case when p_blocked then 'user.block' else 'user.unblock' end,
    'user'::public.audit_subject,
    p_user_id,
    p_label,
    p_reason,
    jsonb_build_object('blocked', jsonb_build_object('from', not p_blocked, 'to', p_blocked))
  );
end;
$function$;
--> statement-breakpoint

-- Service role only, like every admin write: the API's `AdminGuard` is the gate.
revoke execute on function public.admin_record_user_block(uuid, uuid, boolean, text, text)
  from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.admin_record_user_block(uuid, uuid, boolean, text, text) to service_role;
