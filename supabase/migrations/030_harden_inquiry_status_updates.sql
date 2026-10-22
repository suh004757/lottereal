-- Remove destructive and unaudited browser access to customer inquiries.
-- Deploy before the dashboard asset that calls admin_set_inquiry_status.
begin;

revoke delete on table public.inquiries from authenticated;
revoke update on table public.inquiries from authenticated;
grant delete on table public.inquiries to service_role;

drop policy if exists inquiries_admin_update on public.inquiries;
drop policy if exists inquiries_admin_delete on public.inquiries;

create table if not exists public.inquiry_status_audit (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  actor_id uuid not null,
  previous_status text not null check (previous_status in ('unread', 'read')),
  new_status text not null check (new_status in ('unread', 'read')),
  created_at timestamptz not null default now(),
  check (previous_status <> new_status)
);

create index if not exists inquiry_status_audit_inquiry_created_idx
on public.inquiry_status_audit (inquiry_id, created_at, id);

alter table public.inquiry_status_audit enable row level security;
revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated;
grant select on table public.inquiry_status_audit to authenticated;

drop policy if exists inquiry_status_audit_admin_select on public.inquiry_status_audit;
create policy inquiry_status_audit_admin_select
on public.inquiry_status_audit
for select
to authenticated
using (
  auth.uid() is not null
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

create or replace function public.admin_set_inquiry_status(
  p_inquiry_id uuid,
  p_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  previous_status text;
begin
  if actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise insufficient_privilege using message = 'admin role required';
  end if;

  if p_status is null or p_status not in ('unread', 'read') then
    raise invalid_parameter_value using message = 'invalid inquiry status';
  end if;

  select status
  into previous_status
  from public.inquiries
  where id = p_inquiry_id
  for update;

  if not found then
    raise no_data_found using message = 'inquiry not found';
  end if;

  if previous_status = p_status then
    raise check_violation using message = 'inquiry status is unchanged';
  end if;

  update public.inquiries
  set status = p_status
  where id = p_inquiry_id;

  insert into public.inquiry_status_audit (
    inquiry_id,
    actor_id,
    previous_status,
    new_status
  ) values (
    p_inquiry_id,
    actor,
    previous_status,
    p_status
  );

  return p_status;
end;
$$;

revoke all on function public.admin_set_inquiry_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;

comment on table public.inquiry_status_audit is
  'Append-only admin inquiry status history. Rows are removed only with the parent inquiry by the service-role retention lifecycle.';

commit;
