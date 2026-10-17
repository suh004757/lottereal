-- Add first-class rental amounts and append-only listing lifecycle audit history.
-- Existing description-encoded monthly rent rows remain untouched and readable by the UI.
begin;

alter table public.property_listings
  add column if not exists deposit numeric,
  add column if not exists monthly_rent numeric;

alter table public.property_listings
  drop constraint if exists property_listings_deposit_nonnegative,
  drop constraint if exists property_listings_monthly_rent_nonnegative;
alter table public.property_listings
  add constraint property_listings_deposit_nonnegative check (deposit is null or deposit >= 0),
  add constraint property_listings_monthly_rent_nonnegative check (monthly_rent is null or monthly_rent >= 0);

grant select (deposit, monthly_rent) on table public.property_listings to anon, authenticated;
revoke delete on table public.property_listings from authenticated;

create table if not exists public.listing_state_audit (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.property_listings(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_state jsonb not null,
  new_state jsonb not null,
  action text not null check (action in ('confirm_available', 'close', 'reopen')),
  created_at timestamptz not null default now()
);

alter table public.listing_state_audit enable row level security;
revoke all privileges on table public.listing_state_audit from public, anon, authenticated;
grant select on table public.listing_state_audit to authenticated;

drop policy if exists listing_state_audit_admin_select on public.listing_state_audit;
create policy listing_state_audit_admin_select
on public.listing_state_audit
for select
to authenticated
using (auth.uid() is not null and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create or replace function public.admin_confirm_listing_available(listing_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  previous_verified_at timestamptz;
  confirmed_at timestamptz;
begin
  if actor is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  select last_verified_at into previous_verified_at
  from public.property_listings where id = listing_id for update;
  if not found then raise no_data_found using message = 'listing not found'; end if;

  update public.property_listings set last_verified_at = now()
  where id = listing_id returning last_verified_at into confirmed_at;

  insert into public.listing_state_audit
    (listing_id, actor_id, previous_state, new_state, action)
  values
    (listing_id, actor,
     jsonb_build_object('last_verified_at', previous_verified_at),
     jsonb_build_object('last_verified_at', confirmed_at),
     'confirm_available');
  return confirmed_at;
end;
$$;

create or replace function public.admin_set_listing_closed(listing_id uuid, closed boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  previous_closed_at timestamptz;
  result timestamptz;
begin
  if actor is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  select closed_at into previous_closed_at
  from public.property_listings where id = listing_id for update;
  if not found then raise no_data_found using message = 'listing not found'; end if;

  update public.property_listings
  set closed_at = case when closed then coalesce(closed_at, now()) else null end
  where id = listing_id returning closed_at into result;

  insert into public.listing_state_audit
    (listing_id, actor_id, previous_state, new_state, action)
  values
    (listing_id, actor,
     jsonb_build_object('closed_at', previous_closed_at),
     jsonb_build_object('closed_at', result),
     case when closed then 'close' else 'reopen' end);
  return result;
end;
$$;

revoke all on function public.admin_confirm_listing_available(uuid) from public, anon;
grant execute on function public.admin_confirm_listing_available(uuid) to authenticated;
revoke all on function public.admin_set_listing_closed(uuid, boolean) from public, anon;
grant execute on function public.admin_set_listing_closed(uuid, boolean) to authenticated;

commit;
