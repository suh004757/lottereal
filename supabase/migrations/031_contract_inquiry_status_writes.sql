-- Contract phase: run only after migration 030, the RPC frontend deployment,
-- and the transactional admin RPC probe have all been verified.
begin;

-- Repair inherited/drifted grants to the exact live role matrix. service_role
-- keeps only read access and parent deletion for the retention worker.
revoke all privileges on table public.inquiries from public, anon, authenticated, service_role;
grant insert on table public.inquiries to anon;
grant select on table public.inquiries to authenticated;
grant select, delete on table public.inquiries to service_role;

-- Remove every direct UPDATE/DELETE-capable policy, including unknown drifted
-- names and ALL policies. The canonical anon INSERT and admin SELECT policies stay.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiries'
      and cmd in ('ALL', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on public.inquiries', policy_record.policyname);
  end loop;
end
$$;

-- Reassert the private append-only ledger ACL. service_role may inspect audit
-- metadata but cannot INSERT, UPDATE, DELETE, TRUNCATE, or consume its sequence.
revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated, service_role;
grant select on table public.inquiry_status_audit to authenticated, service_role;
revoke all privileges on sequence public.inquiry_status_audit_id_seq from public, anon, authenticated, service_role;

-- Retention remains an ON DELETE CASCADE from inquiries. PostgreSQL performs the
-- child deletion as the referential action; service_role needs DELETE only on the
-- parent and receives no direct DELETE privilege on inquiry_status_audit.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inquiry_status_audit'::regclass
      and confrelid = 'public.inquiries'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ) then
    raise exception 'inquiry_status_audit retention must use on delete cascade';
  end if;
end
$$;

commit;
