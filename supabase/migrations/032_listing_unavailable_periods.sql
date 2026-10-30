-- Dates a listing is already leased (e.g. a one-week short-term lease booked elsewhere).
-- Public pages read only the date ranges to show a calendar and the next move-in date;
-- no tenant data is stored here. Only ADMIN can add or remove a range, and removing a
-- range only reopens those dates: listings themselves are never touched.
begin;

create table if not exists public.listing_unavailable_periods (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.property_listings(id),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  constraint listing_unavailable_periods_range
    check (ends_on >= starts_on and ends_on - starts_on <= 366)
);

create index if not exists listing_unavailable_periods_listing_ends_idx
  on public.listing_unavailable_periods (listing_id, ends_on);

alter table public.listing_unavailable_periods enable row level security;

revoke all on table public.listing_unavailable_periods from public, anon, authenticated;
grant select (id, listing_id, starts_on, ends_on) on table public.listing_unavailable_periods to anon, authenticated;
grant insert (listing_id, starts_on, ends_on) on table public.listing_unavailable_periods to authenticated;
grant delete on table public.listing_unavailable_periods to authenticated;

drop policy if exists listing_unavailable_periods_public_select on public.listing_unavailable_periods;
create policy listing_unavailable_periods_public_select
on public.listing_unavailable_periods
for select
to anon, authenticated
using (true);

drop policy if exists listing_unavailable_periods_admin_insert on public.listing_unavailable_periods;
create policy listing_unavailable_periods_admin_insert
on public.listing_unavailable_periods
for insert
to authenticated
with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists listing_unavailable_periods_admin_delete on public.listing_unavailable_periods;
create policy listing_unavailable_periods_admin_delete
on public.listing_unavailable_periods
for delete
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

commit;
