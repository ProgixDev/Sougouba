-- Public: served straight from Storage's CDN. Objects are keyed
-- `<user_id>/<filename>` so the policies below can scope write access to
-- "your own folder" with one predicate.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
--> statement-breakpoint

-- The bucket is public, so *reading* a file's bytes goes through Storage's
-- CDN URL and never touches RLS at all. These policies gate the other
-- three operations the mobile app's direct-to-Storage avatar upload needs —
-- upsert (replace an existing avatar) needs INSERT + SELECT + UPDATE all
-- three, per the Storage access-control checklist.
create policy "avatars_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint

create policy "avatars_select_own_folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint

create policy "avatars_update_own_folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint

create policy "avatars_delete_own_folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
