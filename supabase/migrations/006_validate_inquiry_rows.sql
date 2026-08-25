-- Reject malformed or unconsented inquiry rows at every database boundary.
-- The table CHECK also applies when RLS is bypassed by service-role/admin writes.

begin;

alter table public.inquiries
  drop constraint if exists inquiries_valid_payload;

alter table public.inquiries
  add constraint inquiries_valid_payload
  check (
    status is not null
    and status in ('unread', 'read')
    and phone is not null
    and phone ~ '^[0-9]{9,11}$'
    and listing_title is not null
    and btrim(listing_title) <> ''
    and message is not null
    and btrim(message) <> ''
    and octet_length(message) <= 4000
    and metadata is not null
    and jsonb_typeof(metadata) = 'object'
    and metadata @> '{"privacy_consent": true}'::jsonb
    and metadata->>'source' = 'public-inquiry-mvp'
    and nullif(btrim(metadata->>'inquiry_type'), '') is not null
    and metadata->>'inquiry_type' in ('callback', 'listing', 'consultation')
    and nullif(btrim(metadata->>'source_channel'), '') is not null
    and metadata->>'source_channel' in ('website', 'zigbang', 'dabang', 'naver', 'walkin', 'other')
    and nullif(btrim(metadata->>'callback_time'), '') is not null
    and metadata->>'callback_time' in ('anytime', 'today-morning', 'today-afternoon', 'weekday-evening', 'tomorrow')
    and octet_length(coalesce(name, '')) <= 200
    and octet_length(coalesce(email, '')) <= 320
    and octet_length(listing_title) <= 500
    and octet_length(metadata::text) <= 4000
  ) not valid;

alter table public.inquiries
  validate constraint inquiries_valid_payload;

-- Remove every permissive public/anon INSERT policy before creating one canonical policy.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiries'
      and cmd in ('ALL', 'INSERT')
      and ('public' = any(roles) or 'anon' = any(roles))
  loop
    execute format('drop policy %I on public.inquiries', policy_record.policyname);
  end loop;
end
$$;

revoke all privileges on table public.inquiries from anon, public;
grant insert on table public.inquiries to anon;

create policy inquiries_public_insert
on public.inquiries
for insert
to anon
with check (
  status is not null
  and status = 'unread'
  and phone is not null
  and phone ~ '^[0-9]{9,11}$'
  and listing_title is not null
  and btrim(listing_title) <> ''
  and message is not null
  and btrim(message) <> ''
  and metadata is not null
  and jsonb_typeof(metadata) = 'object'
  and metadata @> '{"privacy_consent": true}'::jsonb
  and metadata->>'source' = 'public-inquiry-mvp'
  and metadata->>'inquiry_type' in ('callback', 'listing', 'consultation')
  and metadata->>'source_channel' in ('website', 'zigbang', 'dabang', 'naver', 'walkin', 'other')
  and metadata->>'callback_time' in ('anytime', 'today-morning', 'today-afternoon', 'weekday-evening', 'tomorrow')
  and octet_length(coalesce(name, '')) <= 200
  and octet_length(coalesce(email, '')) <= 320
  and octet_length(listing_title) <= 500
  and octet_length(message) <= 4000
  and octet_length(metadata::text) <= 4000
);

commit;
