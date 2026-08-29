-- Add a privacy-safe transaction type for customer-facing interest cards.
-- Prices, addresses, customer identity, and inquiry content remain excluded.

begin;

alter table public.external_inquiry_receipts
  add column if not exists transaction_type text;

-- Legacy receipts can remain untyped for their existing 24-hour retention window.
-- The public frontend drops untyped rows, while all newly deployed writers provide
-- one of the strictly allowed transaction types. NOT NULL can be considered only
-- in a later migration after the compatibility window has elapsed.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_inquiry_receipts_transaction_type_check'
      and conrelid = 'public.external_inquiry_receipts'::regclass
  ) then
    alter table public.external_inquiry_receipts
      add constraint external_inquiry_receipts_transaction_type_check
      check (transaction_type in ('전세', '월세', '매매'));
  end if;
end
$$;

revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public;
grant select (source, listing_number, transaction_type, received_hour, status, expires_at)
on table public.external_inquiry_receipts
to anon, authenticated;

comment on column public.external_inquiry_receipts.transaction_type is
  'Public-safe transaction category only: 전세, 월세, or 매매. No price or property description.';

commit;
