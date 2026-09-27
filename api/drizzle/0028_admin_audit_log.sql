CREATE TYPE "public"."audit_subject" AS ENUM('vendor', 'courier', 'order', 'dispute', 'courier_issue', 'settings');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" "audit_subject" NOT NULL,
	"subject_id" uuid,
	"subject_label" text,
	"reason" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_log_subject_idx" ON "admin_audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_idx" ON "admin_audit_log" USING btree ("actor_id");--> statement-breakpoint

-- ── Append-only, enforced by the database ───────────────────────────────────
--
-- Grants cannot do this. The API connects as the table's owner, so any
-- `revoke update` it issued against itself would be ignored; and an audit log
-- that the application it audits can rewrite is not evidence of anything.
--
-- A trigger is checked for every role, owner included. Corrections are made by
-- appending, the way a ledger is corrected — never by editing what was written.
create or replace function private.reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;
--> statement-breakpoint

create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function private.reject_audit_log_mutation();
--> statement-breakpoint

-- ── Reachability ────────────────────────────────────────────────────────────
--
-- Written only by the API, over its own Postgres connection. Nothing reaches
-- this table through PostgREST: no write grant, and read is admin-only.
alter table public.admin_audit_log enable row level security;
--> statement-breakpoint

revoke all on public.admin_audit_log from anon, authenticated;
--> statement-breakpoint

-- SELECT handed straight back to `authenticated`, on purpose. `revoke all`
-- above removes the *column* privilege Supabase's default grants hand out, and
-- RLS cannot let anyone read a table they hold no SELECT on — the policy below
-- would be a gate standing next to no wall. The privilege decides "may this
-- role read these columns", the policy decides "which rows", and it takes both.
grant select on public.admin_audit_log to authenticated;
--> statement-breakpoint

-- An administrator can read the trail — including their own entries. Being able
-- to see what you did is the point; being able to change it is what the trigger
-- above forbids. Nobody else gets a policy, so for every other signed-in user
-- this table reads as empty rather than as forbidden.
create policy "admin_audit_log_select_admin" on public.admin_audit_log
  for select to authenticated using (private.is_admin());
