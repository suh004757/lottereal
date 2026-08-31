-- Preserve original field photos only for the private family listing board.
-- Official website intake and advertising drafts keep using the existing
-- downsized-only finalize_admin_intake_images RPC.

begin;

update storage.buckets
set public = false,
    file_size_limit = 62914560,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'admin-intake-images';

create or replace function public.finalize_family_listing_images(
  p_report_id uuid,
  p_preview_paths text[],
  p_original_paths text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, storage, auth
as $$
declare
  v_report public.market_reports%rowtype;
  v_uid uuid := auth.uid();
  v_prefix text;
  v_count integer := cardinality(p_preview_paths);
  v_original_count integer := cardinality(p_original_paths);
  v_expected_count integer;
  v_object_count integer;
  v_index integer;
  v_position text;
  v_preview_path text;
  v_original_path text;
begin
  if v_uid is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  if p_report_id is null
     or p_preview_paths is null
     or p_original_paths is null
     or v_count < 1
     or v_count > 30
     or v_original_count <> v_count then
    raise exception 'invalid family image manifest' using errcode = '22023';
  end if;

  select * into v_report
  from public.market_reports
  where id = p_report_id
  for update;

  if not found
     or v_report.status <> 'draft'
     or v_report.metadata ->> 'intake_source' <> 'admin-chat'
     or v_report.metadata ->> 'intake_type' <> 'listing'
     or v_report.metadata ->> 'submitted_by' <> v_uid::text
     or coalesce(v_report.metadata ->> 'family_listing_id', '') = ''
     or coalesce((v_report.metadata ->> 'publish_approved')::boolean, true) <> false then
    raise exception 'eligible private family listing draft not found' using errcode = '42501';
  end if;

  v_prefix := v_uid::text || '/' || p_report_id::text;
  if v_report.metadata ->> 'photo_batch_prefix' <> v_prefix
     or jsonb_typeof(v_report.metadata -> 'expected_image_count') <> 'number' then
    raise exception 'draft image manifest mismatch' using errcode = '22023';
  end if;

  v_expected_count := (v_report.metadata ->> 'expected_image_count')::integer;
  if v_expected_count <> v_count then
    raise exception 'draft image count mismatch' using errcode = '22023';
  end if;

  for v_index in 1..v_count loop
    v_position := lpad(v_index::text, 2, '0');
    v_preview_path := v_prefix || '/preview/' || v_position || '.jpg';
    v_original_path := p_original_paths[v_index];
    if p_preview_paths[v_index] is distinct from v_preview_path then
      raise exception 'invalid private preview path' using errcode = '22023';
    end if;
    if v_original_path is distinct from v_prefix || '/original/' || v_position || '.jpg'
       and v_original_path is distinct from v_prefix || '/original/' || v_position || '.png'
       and v_original_path is distinct from v_prefix || '/original/' || v_position || '.webp' then
      raise exception 'invalid private original path' using errcode = '22023';
    end if;
  end loop;

  select count(*) into v_object_count
  from storage.objects
  where bucket_id = 'admin-intake-images'
    and name = any(p_preview_paths || p_original_paths);

  if v_object_count <> v_count * 2 then
    raise exception 'private family image object missing' using errcode = '22023';
  end if;

  update public.market_reports
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'photo_upload_state', 'complete',
        'private_image_paths', to_jsonb(p_preview_paths),
        'private_original_image_paths', to_jsonb(p_original_paths),
        'image_count', v_count,
        'original_image_count', v_original_count
      ),
      updated_at = now()
  where id = p_report_id
  returning * into v_report;

  return jsonb_build_object(
    'id', v_report.id,
    'status', v_report.status,
    'metadata', v_report.metadata,
    'updated_at', v_report.updated_at
  );
end;
$$;

revoke all on function public.finalize_family_listing_images(uuid, text[], text[]) from public, anon;
grant execute on function public.finalize_family_listing_images(uuid, text[], text[]) to authenticated;

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
              ||
              case
                when jsonb_typeof(m.metadata -> 'private_original_image_paths') = 'array'
                  then m.metadata -> 'private_original_image_paths'
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
