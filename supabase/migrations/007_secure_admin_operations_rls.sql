-- Replace permissive authenticated policies with explicit public-read/admin-write boundaries.
-- ADMIN chat intakes remain private drafts until a separate reviewed publication flow is used.

begin;

alter table public.market_reports enable row level security;
alter table public.property_listings enable row level security;
alter table public.inquiries enable row level security;

-- The repository did not preserve every production policy name. Remove the current
-- policy set for these three tables and rebuild the intended matrix atomically.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('market_reports', 'property_listings', 'inquiries')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

revoke all privileges on table public.market_reports from anon, authenticated, public;
grant select on table public.market_reports to anon, authenticated;
grant insert, update, delete on table public.market_reports to authenticated;

create policy market_reports_public_published_select
on public.market_reports
for select
to anon, authenticated
using (status = 'published');

create policy market_reports_admin_select_all
on public.market_reports
for select
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy market_reports_admin_insert
on public.market_reports
for insert
to authenticated
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (
    metadata ->> 'intake_source' is distinct from 'admin-chat'
    or (
      status = 'draft'
      and coalesce(metadata ->> 'publish_approved', 'false') = 'false'
    )
  )
);

create policy market_reports_admin_update
on public.market_reports
for update
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and (
    metadata ->> 'intake_source' is distinct from 'admin-chat'
    or (
      status = 'draft'
      and coalesce(metadata ->> 'publish_approved', 'false') = 'false'
    )
  )
);

create policy market_reports_admin_delete
on public.market_reports
for delete
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

revoke all privileges on table public.property_listings from anon, authenticated, public;
grant select on table public.property_listings to anon, authenticated;
grant insert, update, delete on table public.property_listings to authenticated;

create policy property_listings_public_select
on public.property_listings
for select
to anon, authenticated
using (true);

create policy property_listings_admin_insert
on public.property_listings
for insert
to authenticated
with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy property_listings_admin_update
on public.property_listings
for update
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy property_listings_admin_delete
on public.property_listings
for delete
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

revoke all privileges on table public.inquiries from anon, authenticated, public;
grant insert on table public.inquiries to anon;
grant select, update, delete on table public.inquiries to authenticated;

create policy inquiries_public_insert
on public.inquiries
for insert
to anon
with check (
  status = 'unread'
  and phone is not null
  and phone ~ '^[0-9]{9,11}$'
  and listing_title is not null
  and btrim(listing_title) <> ''
  and message is not null
  and btrim(message) <> ''
  and metadata is not null
  and jsonb_typeof(metadata) = 'object'
  and metadata @> '{"privacy_consent": true}'::jsonb
  and metadata ->> 'source' = 'public-inquiry-mvp'
  and metadata ->> 'inquiry_type' in ('callback', 'listing', 'consultation')
  and metadata ->> 'source_channel' in ('website', 'zigbang', 'dabang', 'naver', 'walkin', 'other')
  and metadata ->> 'callback_time' in ('anytime', 'today-morning', 'today-afternoon', 'weekday-evening', 'tomorrow')
  and octet_length(coalesce(name, '')) <= 200
  and octet_length(coalesce(email, '')) <= 320
  and octet_length(listing_title) <= 500
  and octet_length(message) <= 4000
  and octet_length(metadata::text) <= 4000
);

create policy inquiries_admin_select
on public.inquiries
for select
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy inquiries_admin_update
on public.inquiries
for update
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy inquiries_admin_delete
on public.inquiries
for delete
to authenticated
using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

commit;
