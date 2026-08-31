-- Allow the three family listing members to view completed photos that are
-- explicitly attached to a family listing. Generic ADMIN intake photos remain
-- visible only to the uploader. The bucket stays private.

begin;

drop policy if exists admin_intake_images_admin_select on storage.objects;

create policy admin_intake_images_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'admin-intake-images'
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      public.is_family_listing_member()
      and exists (
        select 1
        from public.market_reports m
        where m.id::text = (storage.foldername(name))[2]
          and m.status = 'draft'
          and m.metadata ->> 'intake_type' = 'listing'
          and m.metadata ->> 'photo_upload_state' = 'complete'
          and coalesce(m.metadata ->> 'family_listing_id', '') <> ''
          and m.metadata ->> 'submitted_by' = (storage.foldername(name))[1]
          and exists (
            select 1
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(m.metadata -> 'private_image_paths') = 'array'
                  then m.metadata -> 'private_image_paths'
                else '[]'::jsonb
              end
            ) as manifest_item(object_path)
            where object_path = storage.objects.name
          )
      )
    )
  )
);

commit;
