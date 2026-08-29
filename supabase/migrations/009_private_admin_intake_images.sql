-- Private photo storage for ADMIN chat listing drafts.
-- Objects are never public; browser access is limited to the authenticated
-- admin's own UID folder. Server-side service-role review can bypass RLS.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'admin-intake-images',
  'admin-intake-images',
  false,
  8388608,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists admin_intake_images_admin_select on storage.objects;
drop policy if exists admin_intake_images_admin_insert on storage.objects;
drop policy if exists admin_intake_images_admin_update on storage.objects;
drop policy if exists admin_intake_images_admin_delete on storage.objects;

create policy admin_intake_images_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy admin_intake_images_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy admin_intake_images_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy admin_intake_images_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
