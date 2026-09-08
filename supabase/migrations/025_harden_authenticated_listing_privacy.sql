-- Ensure signed-in non-admin users cannot read private listing ownership/contact columns.
-- ADMIN full-row reads go through a role-checked SECURITY DEFINER function.
begin;

alter table public.property_listings enable row level security;

revoke all privileges on table public.property_listings from authenticated;

grant select (
  id,
  title,
  description,
  price,
  currency,
  property_type,
  address,
  city,
  district,
  latitude,
  longitude,
  images,
  created_at
) on table public.property_listings to authenticated;

grant insert, update, delete on table public.property_listings to authenticated;

create or replace function public.admin_list_property_listings()
returns setof public.property_listings
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  return query
  select listing.*
  from public.property_listings as listing;
end;
$$;

revoke all on function public.admin_list_property_listings() from public, anon;
grant execute on function public.admin_list_property_listings() to authenticated;

commit;
