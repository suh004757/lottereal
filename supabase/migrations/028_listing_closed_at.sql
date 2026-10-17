-- Reversible "거래 완료" for listings. Nothing is deleted: a closed listing keeps its row,
-- images and history, disappears from public reads, and stays visible to ADMIN, who can
-- reopen it. closed_at is not granted to anon; the public policy filters on it.
begin;

alter table public.property_listings
  add column if not exists closed_at timestamptz;

drop policy if exists property_listings_public_select on public.property_listings;
create policy property_listings_public_select
on public.property_listings
for select
to anon, authenticated
using (closed_at is null);

drop policy if exists property_listings_admin_select on public.property_listings;
create policy property_listings_admin_select
on public.property_listings
for select
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create or replace function public.admin_set_listing_closed(listing_id uuid, closed boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  changed integer;
  result timestamptz;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  update public.property_listings
     set closed_at = case when closed then coalesce(closed_at, now()) else null end
   where id = listing_id
  returning closed_at into result;

  get diagnostics changed = row_count;
  if changed = 0 then
    raise no_data_found using message = 'listing not found';
  end if;

  return result;
end;
$$;

revoke all on function public.admin_set_listing_closed(uuid, boolean) from public, anon;
grant execute on function public.admin_set_listing_closed(uuid, boolean) to authenticated;

commit;
