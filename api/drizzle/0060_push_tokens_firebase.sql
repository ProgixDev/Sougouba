-- Device tokens from Firebase Cloud Messaging.
--
-- Notifications now go through Firebase on both platforms, so a phone
-- registers a Firebase registration token instead of the `ExponentPushToken[…]`
-- Expo's push service issued. The column's check only allowed the Expo shape,
-- and would refuse every phone running a current build.
--
-- Firebase documents no format and no length for its tokens — only that they
-- are opaque — so the new rule is loose on purpose: one run of characters, of a
-- plausible size. Expo's tokens satisfy it too: builds made before Firebase was
-- added keep registering theirs, and are still sent to through Expo.

alter table public.push_tokens drop constraint push_tokens_token_check;
--> statement-breakpoint

alter table public.push_tokens
  add constraint push_tokens_token_check
  check (char_length(token) between 20 and 4096 and token !~ '\s');
