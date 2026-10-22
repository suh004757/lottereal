-- Contract phase: run only after migration 030, the RPC frontend deployment,
-- and the transactional admin RPC probe have all been verified.
begin;

-- Reassert the fixed ownership boundary before inspecting or repairing ACLs.
alter table public.inquiry_status_audit owner to postgres;
alter sequence public.inquiry_status_audit_id_seq owner to postgres;
alter function public.admin_set_inquiry_status(uuid, text) owner to postgres;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('inquiry_status_audit', 'inquiry_status_audit_id_seq')
      and c.relowner <> 'postgres'::regrole
  ) or exists (
    select 1
    from pg_proc p
    where p.oid = 'public.admin_set_inquiry_status(uuid,text)'::regprocedure
      and p.proowner <> 'postgres'::regrole
  ) then
    raise exception 'inquiry hardening owner validation failed';
  end if;
end
$$;

-- Remove direct grants to every named non-owner grantee, including roles not in
-- the application matrix. PUBLIC is reset explicitly with the canonical roles
-- below because its ACL grantee OID is zero rather than a named role.
do $acl$
declare
  acl_record record;
begin
  for acl_record in
    select distinct c.relkind, c.relname, pg_get_userbyid(a.grantee) as grantee
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault(c.relkind, c.relowner))
    ) a
    where n.nspname = 'public'
      and c.relname in (
        'inquiries',
        'inquiry_status_audit',
        'inquiry_status_audit_id_seq'
      )
      and a.grantee <> 0
      and a.grantee <> c.relowner
  loop
    if acl_record.relkind = 'S' then
      execute format(
        'revoke all privileges on sequence public.inquiry_status_audit_id_seq from %I',
        acl_record.grantee
      );
    else
      execute format(
        'revoke all privileges on table public.%I from %I',
        acl_record.relname,
        acl_record.grantee
      );
    end if;
  end loop;

  for acl_record in
    select distinct pg_get_userbyid(a.grantee) as grantee
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.admin_set_inquiry_status(uuid,text)'::regprocedure
      and a.grantee <> 0
      and a.grantee <> p.proowner
  loop
    execute format(
      'revoke all privileges on function public.admin_set_inquiry_status(uuid, text) from %I',
      acl_record.grantee
    );
  end loop;
end
$acl$;

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
revoke all privileges on function public.admin_set_inquiry_status(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;

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
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.inquiry_status_audit'::regclass
           and attname = 'inquiry_id')
      ]::smallint[]
      and confkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.inquiries'::regclass
           and attname = 'id')
      ]::smallint[]
  ) then
    raise exception 'inquiry_status_audit retention must use on delete cascade';
  end if;
end
$$;

commit;
