-- Passwordless: a code is now how *everyone* gets in, sign-up and sign-in alike.
--
-- The code is issued before the API knows (or reveals) whether the address has
-- an account — the account is found or created only once the code checks out.
-- So a row no longer points at a user, and the HMAC binds the code to the
-- address instead. Outstanding rows are dropped: their hashes were bound to the
-- old input and can no longer verify.

delete from public.email_verification_codes;
--> statement-breakpoint
alter table public.email_verification_codes drop column user_id;
