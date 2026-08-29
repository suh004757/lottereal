-- Public receipt metadata for external-platform inquiry email delivery.
-- No customer identity, contact details, message body, property address, or price is stored here.

begin;

create table if not exists public.external_inquiry_receipts (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source = 'zigbang'),
  listing_number text not null check (listing_number ~ '^[0-9]{5,20}$'),
  received_hour timestamptz not null check (
    extract(minute from received_hour) = 0
    and extract(second from received_hour) = 0
  ),
  status text not null default 'received' check (status = 'received'),
  source_message_hash text not null unique check (source_message_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (received_hour <= created_at + interval '5 minutes'),
  check (received_hour >= created_at - interval '30 days'),
  check (expires_at = created_at + interval '24 hours')
);

alter table public.external_inquiry_receipts enable row level security;

revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public;
grant select (source, listing_number, received_hour, status, expires_at)
on table public.external_inquiry_receipts
to anon, authenticated;

create policy external_inquiry_receipts_public_unexpired_select
on public.external_inquiry_receipts
for select
to anon, authenticated
using (
  expires_at > now()
  and expires_at <= created_at + interval '24 hours'
  and received_hour <= created_at + interval '5 minutes'
  and received_hour >= created_at - interval '30 days'
);

comment on table public.external_inquiry_receipts is
  '24-hour public receipt metadata for verified external-platform inquiry emails; contains no customer identity or message content.';
comment on column public.external_inquiry_receipts.source_message_hash is
  'Server-only SHA-256 deduplication key; intentionally excluded from anon/authenticated column grants.';

commit;
