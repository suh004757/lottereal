-- Add a privacy-minimized public activity archive without breaking the
-- currently deployed table reader. Apply after migration 012 and before
-- deploying the RPC-based frontend.

begin;

drop policy if exists external_inquiry_receipts_public_unexpired_select
on public.external_inquiry_receipts;

drop policy if exists external_inquiry_receipts_public_recent_activity_select
on public.external_inquiry_receipts;

create policy external_inquiry_receipts_public_unexpired_select
on public.external_inquiry_receipts
for select
to anon, authenticated
using (
  status = 'received'
  and transaction_type in ('전세', '월세', '매매')
  and expires_at > now()
  and received_hour >= now() - interval '24 hours'
  and received_hour <= now() + interval '5 minutes'
);

create or replace function public.get_external_inquiry_activity()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with eligible as (
    select
      source,
      listing_number,
      transaction_type,
      received_hour,
      status
    from public.external_inquiry_receipts
    where status = 'received'
      and transaction_type in ('전세', '월세', '매매')
      and received_hour >= now() - interval '365 days'
      and received_hour <= now() + interval '5 minutes'
  ),
  counts as (
    select
      count(*)::integer as total,
      count(*) filter (where transaction_type = '전세')::integer as jeonse,
      count(*) filter (where transaction_type = '월세')::integer as monthly_rent,
      count(*) filter (where transaction_type = '매매')::integer as sale
    from eligible
  ),
  latest as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source', source,
          'listing_number', listing_number,
          'transaction_type', transaction_type,
          'activity_kind', case
            when received_hour >= now() - interval '24 hours' then 'current'
            else 'history'
          end,
          'received_bucket', case
            when received_hour >= now() - interval '24 hours'
              then to_char(received_hour at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:00:00') || '+09:00'
            else to_char(received_hour at time zone 'Asia/Seoul', 'YYYY-MM-DD')
          end,
          'status', status
        )
        order by received_hour desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from eligible
      order by received_hour desc
      limit 12
    ) bounded
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', counts.total,
      'jeonse', counts.jeonse,
      'monthly_rent', counts.monthly_rent,
      'sale', counts.sale
    ),
    'items', latest.items
  )
  from counts cross join latest;
$$;

revoke all on function public.get_external_inquiry_activity() from public;
grant execute on function public.get_external_inquiry_activity() to anon, authenticated;

comment on function public.get_external_inquiry_activity() is
  'Returns a fixed public-safe one-year inquiry activity summary and at most 12 recent items. Current items use an hour bucket; older items use a date only.';

commit;
