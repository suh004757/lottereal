-- Finalized private intake images are immutable. Writers may retry or clean up
-- only while the owning report's upload manifest is still pending.

begin;

drop policy if exists admin_intake_images_admin_update on storage.objects;
create policy admin_intake_images_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.market_reports m
    where m.id::text = (storage.foldername(name))[2]
      and m.status = 'draft'
      and m.metadata ->> 'intake_source' = 'admin-chat'
      and m.metadata ->> 'submitted_by' = auth.uid()::text
      and m.metadata ->> 'photo_upload_state' = 'pending'
  )
)
with check (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.market_reports m
    where m.id::text = (storage.foldername(name))[2]
      and m.status = 'draft'
      and m.metadata ->> 'intake_source' = 'admin-chat'
      and m.metadata ->> 'submitted_by' = auth.uid()::text
      and m.metadata ->> 'photo_upload_state' = 'pending'
  )
);

drop policy if exists admin_intake_images_admin_delete on storage.objects;
create policy admin_intake_images_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.market_reports m
    where m.id::text = (storage.foldername(name))[2]
      and m.status = 'draft'
      and m.metadata ->> 'intake_source' = 'admin-chat'
      and m.metadata ->> 'submitted_by' = auth.uid()::text
      and m.metadata ->> 'photo_upload_state' = 'pending'
  )
);

commit;
