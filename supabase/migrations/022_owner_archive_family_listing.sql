-- Reversible owner-only removal for private family listings.
-- No DELETE grant or policy is introduced: archived rows, source drafts, events,
-- and private photos remain recoverable and disappear from ordinary member reads.

begin;

alter table public.family_listing_records
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists family_listing_records_active_updated_idx
  on public.family_listing_records (updated_at desc)
  where deleted_at is null;

drop policy if exists family_listing_records_admin_select
  on public.family_listing_records;
create policy family_listing_records_admin_select
on public.family_listing_records
for select
to authenticated
using (
  public.is_family_listing_member()
  and deleted_at is null
);

drop policy if exists family_listing_records_admin_insert
  on public.family_listing_records;
create policy family_listing_records_admin_insert
on public.family_listing_records
for insert
to authenticated
with check (
  public.is_family_listing_member()
  and created_by = auth.uid()
  and deleted_at is null
  and deleted_by is null
);

drop policy if exists family_listing_records_admin_update
  on public.family_listing_records;
create policy family_listing_records_admin_update
on public.family_listing_records
for update
to authenticated
using (
  public.is_family_listing_member()
  and deleted_at is null
)
with check (
  public.is_family_listing_member()
  and deleted_at is null
  and deleted_by is null
);

create or replace function public.archive_family_listing_as_owner(
  p_record_id uuid
)
returns public.family_listing_records
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  saved public.family_listing_records%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.family_listing_members
    where user_id = actor_id
      and family_role = 'owner'
  ) then
    raise exception 'owner permission required' using errcode = '42501';
  end if;

  update public.family_listing_records
     set deleted_at = now(),
         deleted_by = actor_id
   where id = p_record_id
     and deleted_at is null
  returning * into saved;

  if not found then
    raise exception 'active listing not found' using errcode = 'P0002';
  end if;

  return saved;
end;
$$;

revoke all on function public.archive_family_listing_as_owner(uuid)
from public, anon;
grant execute on function public.archive_family_listing_as_owner(uuid)
to authenticated;

commit;
