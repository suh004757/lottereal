-- Expand phase: install the audited RPC without breaking cached dashboard assets.
-- Apply and verify this migration before deploying the RPC frontend. Migration 031
-- is the separate contract phase that removes direct browser writes.
begin;

create table if not exists public.inquiry_status_audit (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  actor_id uuid not null,
  previous_status text not null
    constraint inquiry_status_audit_previous_status_check
    check (previous_status in ('unread', 'read')),
  new_status text not null
    constraint inquiry_status_audit_new_status_check
    check (new_status in ('unread', 'read')),
  created_at timestamptz not null default now(),
  constraint inquiry_status_audit_status_changed_check
    check (previous_status <> new_status)
);

-- Fail closed if a pre-existing object with this name does not have the shape on
-- which the RPC and retention cascade depend. The identity sequence name is also
-- fixed so its ACL can be repaired deterministically below.
do $$
begin
  if to_regclass('public.inquiry_status_audit') is null
     or pg_get_serial_sequence('public.inquiry_status_audit', 'id')
        is distinct from 'public.inquiry_status_audit_id_seq'
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inquiry_status_audit'
         and column_name = 'id'
         and data_type = 'bigint'
         and is_nullable = 'NO'
         and is_identity = 'YES'
     )
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inquiry_status_audit'
         and column_name = 'inquiry_id'
         and data_type = 'uuid'
         and is_nullable = 'NO'
     )
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inquiry_status_audit'
         and column_name = 'actor_id'
         and data_type = 'uuid'
         and is_nullable = 'NO'
     )
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inquiry_status_audit'
         and column_name in ('previous_status', 'new_status')
         and data_type = 'text'
         and is_nullable = 'NO'
       group by table_schema, table_name
       having count(*) = 2
     )
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inquiry_status_audit'
         and column_name = 'created_at'
         and data_type = 'timestamp with time zone'
         and is_nullable = 'NO'
         and column_default = 'now()'
     )
     or not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.inquiry_status_audit'::regclass
         and contype = 'c'
         and convalidated
         and conname in (
         'inquiry_status_audit_previous_status_check',
         'inquiry_status_audit_new_status_check',
         'inquiry_status_audit_status_changed_check'
       )
       group by conrelid
       having count(*) = 3
     )
     or not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.inquiry_status_audit'::regclass
         and contype = 'p'
         and conkey = array[
           (select attnum from pg_attribute
            where attrelid = 'public.inquiry_status_audit'::regclass
              and attname = 'id')
         ]::smallint[]
     )
     or not exists (
       select 1
       from pg_constraint
       where conrelid = 'public.inquiry_status_audit'::regclass
         and confrelid = 'public.inquiries'::regclass
         and contype = 'f'
         and confdeltype = 'c'
     ) then
    raise exception 'inquiry_status_audit schema validation failed';
  end if;
end
$$;

alter table public.inquiry_status_audit owner to postgres;

create index if not exists inquiry_status_audit_inquiry_created_idx
on public.inquiry_status_audit (inquiry_id, created_at, id);

alter table public.inquiry_status_audit enable row level security;

-- Replace every audit policy so permissive policy drift cannot make the private
-- ledger writable or visible to non-admin browser users.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiry_status_audit'
  loop
    execute format(
      'drop policy %I on public.inquiry_status_audit',
      policy_record.policyname
    );
  end loop;
end
$$;

revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated, service_role;
grant select on table public.inquiry_status_audit to authenticated, service_role;
revoke all privileges on sequence public.inquiry_status_audit_id_seq from public, anon, authenticated, service_role;

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
set search_path = ''
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

alter function public.admin_set_inquiry_status(uuid, text) owner to postgres;
revoke all on function public.admin_set_inquiry_status(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;

-- Compatibility bridge for cached pre-RPC dashboard assets. Do not remove this
-- grant in the expand phase; migration 031 revokes it after frontend verification.
grant update on table public.inquiries to authenticated;

comment on table public.inquiry_status_audit is
  'Append-only admin inquiry status history. App roles may not mutate or truncate it; rows are removed only by the parent inquiry retention cascade.';

commit;
