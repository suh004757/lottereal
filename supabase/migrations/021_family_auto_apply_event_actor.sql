-- Preserve immutable listing history when the service-only parser updates a
-- record. Human updates remain attributed to auth.uid(); only service_role may
-- fall back to the record's original creator.

begin;

create or replace function public.log_family_listing_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    actor_id := new.created_by;
  elsif actor_id is null and auth.role() = 'service_role' then
    actor_id := new.created_by;
  end if;

  if actor_id is null then
    raise exception 'listing event actor is required';
  end if;

  if tg_op = 'INSERT' then
    insert into public.family_listing_events (record_id, event_type, status_to, created_by)
    values (new.id, 'created', new.status, actor_id);
  elsif old.status is distinct from new.status then
    insert into public.family_listing_events (record_id, event_type, status_from, status_to, created_by)
    values (new.id, 'status_changed', old.status, new.status, actor_id);
  else
    insert into public.family_listing_events (record_id, event_type, status_from, status_to, created_by)
    values (new.id, 'updated', old.status, new.status, actor_id);
  end if;
  return new;
end;
$$;

revoke all on function public.log_family_listing_event()
from public, anon, authenticated;

commit;
