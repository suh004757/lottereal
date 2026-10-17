-- Let ADMIN re-confirm that a listing is still available.
-- Public pages treat a listing as current for 30 days after last_verified_at (falling back
-- to created_at); without this column every listing went stale 30 days after creation.
-- The timestamp is not personal data, so anon/authenticated may read it; only ADMIN may set
-- it, through a role-checked SECURITY DEFINER function that touches this one column.
begin;

alter table public.property_listings
  add column if not exists last_verified_at timestamptz;

grant select (last_verified_at) on table public.property_listings to anon, authenticated;

create or replace function public.admin_confirm_listing_available(listing_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  confirmed_at timestamptz;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  update public.property_listings
     set last_verified_at = now()
   where id = listing_id
  returning last_verified_at into confirmed_at;

  if confirmed_at is null then
    raise no_data_found using message = 'listing not found';
  end if;

  return confirmed_at;
end;
$$;

revoke all on function public.admin_confirm_listing_available(uuid) from public, anon;
grant execute on function public.admin_confirm_listing_available(uuid) to authenticated;

commit;
