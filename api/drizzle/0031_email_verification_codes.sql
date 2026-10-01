-- Sign-up confirmation codes, issued and checked by the API — not by Supabase Auth.
--
-- Supabase's own "confirm your email" mail is not used: accounts are created
-- server-side with `auth.admin.createUser` (which never sends mail), and this
-- table holds the one-time code the API emails instead. On a correct code the
-- API flips `email_confirmed_at` through the admin API and deletes the row.
--
-- Keyed by the address, lower-cased, because every caller of this table — the
-- verify and resend endpoints — knows the email and nothing else; `profiles`
-- carries no email column to look the account up by.
--
-- Only the HMAC of the code is stored. Six digits are a million guesses, so a
-- leaked table must not simply hand them over; the key is the API's own secret.

create table public.email_verification_codes (
  email       text primary key check (email = lower(email)),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  sent_at     timestamptz not null default now()
);
--> statement-breakpoint

-- Service role only. RLS on with no policies, and the grants revoked, so a
-- client holding the anon key cannot read or write a code over PostgREST.
alter table public.email_verification_codes enable row level security;
--> statement-breakpoint
revoke all on table public.email_verification_codes from public, anon, authenticated;
