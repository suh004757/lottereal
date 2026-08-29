-- Atomically finalize private images that already belong to an ADMIN-chat listing draft.
-- The function is idempotent and verifies every Storage object before recording paths.

create or replace function public.finalize_admin_intake_images(
  p_report_id uuid,
  p_paths text[]
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
  v_count integer := cardinality(p_paths);
  v_expected_count integer;
  v_object_count integer;
  v_index integer;
  v_expected_path text;
begin
  if v_uid is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  if p_report_id is null or p_paths is null or v_count < 1 or v_count > 30 then
    raise exception 'invalid image manifest' using errcode = '22023';
  end if;

  select *
    into v_report
    from public.market_reports
   where id = p_report_id
   for update;

  if not found
     or v_report.status <> 'draft'
     or v_report.metadata ->> 'intake_source' <> 'admin-chat'
     or v_report.metadata ->> 'intake_type' <> 'listing'
     or v_report.metadata ->> 'submitted_by' <> v_uid::text
     or coalesce((v_report.metadata ->> 'publish_approved')::boolean, true) <> false then
    raise exception 'eligible private listing draft not found' using errcode = '42501';
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
    v_expected_path := v_prefix || '/' || lpad(v_index::text, 2, '0') || '.jpg';
    if p_paths[v_index] is distinct from v_expected_path then
      raise exception 'invalid private image path' using errcode = '22023';
    end if;
  end loop;

  select count(*)
    into v_object_count
    from storage.objects
   where bucket_id = 'admin-intake-images'
     and name = any(p_paths);

  if v_object_count <> v_count then
    raise exception 'private image object missing' using errcode = '22023';
  end if;

  update public.market_reports
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
       'photo_upload_state', 'complete',
       'private_image_paths', to_jsonb(p_paths),
       'image_count', v_count
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

revoke all on function public.finalize_admin_intake_images(uuid, text[]) from public;
revoke all on function public.finalize_admin_intake_images(uuid, text[]) from anon;
grant execute on function public.finalize_admin_intake_images(uuid, text[]) to authenticated;
