# Inquiry status hardening: forward-only expand/contract rollout

This release deliberately separates compatibility from contraction. Do not apply
`031` in the same change window as `030`, and do not publish the RPC frontend
before the `030` readiness gate passes. All probes below print only booleans,
role/object names, counts, or a fixed success notice; no customer row or identifier is printed.

## 1. Apply migration 030

Apply only `supabase/migrations/030_harden_inquiry_status_updates.sql` using the
normal migration mechanism. It creates and validates the private audit ledger,
installs the fixed-owner RPC, repairs audit table/sequence ACLs, and deliberately
keeps authenticated direct `UPDATE` for cached old dashboard assets.

## 2. Verify 030 readiness

Run this exact SQL in the SQL editor. Every value in the `ready` column must be
`t`; no inquiry data is selected.

```sql
select 'audit_table_exists' as check_name,
       to_regclass('public.inquiry_status_audit') is not null as ready
union all
select 'audit_sequence_exists',
       to_regclass('public.inquiry_status_audit_id_seq') is not null
union all
select 'audit_rls_enabled',
       (select relrowsecurity
        from pg_class
        where oid = 'public.inquiry_status_audit'::regclass)
union all
select 'retention_cascade',
       exists (
         select 1
         from pg_constraint
         where conrelid = 'public.inquiry_status_audit'::regclass
           and confrelid = 'public.inquiries'::regclass
           and contype = 'f'
           and confdeltype = 'c'
       )
union all
select 'rpc_owner_postgres',
       pg_get_userbyid(
         (select proowner
          from pg_proc
          where oid = 'public.admin_set_inquiry_status(uuid,text)'::regprocedure)
       ) = 'postgres'
union all
select 'rpc_empty_search_path',
       (select proconfig = array['search_path=""']
        from pg_proc
        where oid = 'public.admin_set_inquiry_status(uuid,text)'::regprocedure)
union all
select 'rpc_authenticated_execute',
       has_function_privilege(
         'authenticated',
         'public.admin_set_inquiry_status(uuid,text)',
         'EXECUTE'
       )
union all
select 'rpc_anon_denied',
       not has_function_privilege(
         'anon',
         'public.admin_set_inquiry_status(uuid,text)',
         'EXECUTE'
       )
union all
select 'rpc_service_denied',
       not has_function_privilege(
         'service_role',
         'public.admin_set_inquiry_status(uuid,text)',
         'EXECUTE'
       )
union all
select 'legacy_update_bridge_present',
       has_table_privilege('authenticated', 'public.inquiries', 'UPDATE')
union all
select 'audit_service_mutation_denied',
       not has_table_privilege(
         'service_role',
         'public.inquiry_status_audit',
         'INSERT,UPDATE,DELETE,TRUNCATE'
       )
union all
select 'audit_sequence_service_denied',
       not has_sequence_privilege(
         'service_role',
         'public.inquiry_status_audit_id_seq',
         'USAGE,SELECT,UPDATE'
       );
```

Stop if any row is false. Repair with a new forward migration; do not deploy the
new asset against an unready schema.

## 3. Deploy the RPC frontend

Deploy the Pages artifact containing `public/js/services/backendAdapter.js`.
After the exact revision manifest is live, verify that the deployed adapter calls
the RPC and does not contain the legacy table update chain:

```bash
curl -fsS https://lottes.co.kr/js/services/backendAdapter.js -o /tmp/backendAdapter.live.js
grep -F ".rpc('admin_set_inquiry_status'" /tmp/backendAdapter.live.js
test "$(grep -cF ".update({ status })" /tmp/backendAdapter.live.js)" -eq 0
```

Keep the old asset available until the next gate passes; `030` still supports it.

## 4. Verify the admin RPC

First exercise one status change from the live dashboard with a freshly refreshed
admin session and confirm the UI succeeds. Then run this transactional SQL probe.
It selects its target internally, prints only `admin RPC probe: ok`, and rolls the
status change and audit insert back. If there is no admin or no inquiry, it fails
closed without printing either identifier.

```sql
begin;

-- Establish admin JWT claims without returning the selected admin identifier.
do $claims$
declare
  probe_admin uuid;
begin
  select id
  into probe_admin
  from auth.users
  where raw_app_meta_data ->> 'role' = 'admin'
  order by created_at
  limit 1;

  if probe_admin is null then
    raise exception 'admin RPC probe prerequisites missing';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', probe_admin,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('role', 'admin')
    )::text,
    true
  );
end
$claims$;

set local role authenticated;

do $probe$
declare
  probe_inquiry uuid;
  old_status text;
  probe_status text;
  audit_before bigint;
  audit_after bigint;
begin
  select id, status
  into probe_inquiry, old_status
  from public.inquiries
  where status in ('unread', 'read')
  order by created_at
  limit 1
  for update;

  if probe_inquiry is null then
    raise exception 'admin RPC probe prerequisites missing';
  end if;

  probe_status := case old_status when 'read' then 'unread' else 'read' end;

  select count(*)
  into audit_before
  from public.inquiry_status_audit
  where inquiry_id = probe_inquiry;

  if public.admin_set_inquiry_status(probe_inquiry, probe_status)
     is distinct from probe_status then
    raise exception 'admin RPC probe returned an unexpected status';
  end if;

  select count(*)
  into audit_after
  from public.inquiry_status_audit
  where inquiry_id = probe_inquiry;

  if audit_after <> audit_before + 1 then
    raise exception 'admin RPC probe did not append exactly one audit row';
  end if;

  raise notice 'admin RPC probe: ok';
end
$probe$;

rollback;
```

Do not continue unless both the live UI action and transactional probe succeed.

## 5. Apply migration 031

After the RPC frontend and RPC gate are green, apply only
`supabase/migrations/031_contract_inquiry_status_writes.sql`. This removes direct
browser mutation, drops all `ALL`/`UPDATE`/`DELETE` inquiry policies, narrows the
service role to parent `SELECT, DELETE`, and reasserts append-only audit ACLs.

## 6. Verify the live role matrix

Run the exact query below. Every `matches_expected` value must be `t`. It prints
only role names, privilege names, and booleans.

```sql
with expected_table(role_name, object_name, privilege_name, expected) as (
  values
    ('anon', 'public.inquiries', 'SELECT', false),
    ('anon', 'public.inquiries', 'INSERT', true),
    ('anon', 'public.inquiries', 'UPDATE', false),
    ('anon', 'public.inquiries', 'DELETE', false),
    ('authenticated', 'public.inquiries', 'SELECT', true),
    ('authenticated', 'public.inquiries', 'INSERT', false),
    ('authenticated', 'public.inquiries', 'UPDATE', false),
    ('authenticated', 'public.inquiries', 'DELETE', false),
    ('service_role', 'public.inquiries', 'SELECT', true),
    ('service_role', 'public.inquiries', 'INSERT', false),
    ('service_role', 'public.inquiries', 'UPDATE', false),
    ('service_role', 'public.inquiries', 'DELETE', true),
    ('anon', 'public.inquiry_status_audit', 'SELECT', false),
    ('anon', 'public.inquiry_status_audit', 'INSERT', false),
    ('anon', 'public.inquiry_status_audit', 'UPDATE', false),
    ('anon', 'public.inquiry_status_audit', 'DELETE', false),
    ('anon', 'public.inquiry_status_audit', 'TRUNCATE', false),
    ('authenticated', 'public.inquiry_status_audit', 'SELECT', true),
    ('authenticated', 'public.inquiry_status_audit', 'INSERT', false),
    ('authenticated', 'public.inquiry_status_audit', 'UPDATE', false),
    ('authenticated', 'public.inquiry_status_audit', 'DELETE', false),
    ('authenticated', 'public.inquiry_status_audit', 'TRUNCATE', false),
    ('service_role', 'public.inquiry_status_audit', 'SELECT', true),
    ('service_role', 'public.inquiry_status_audit', 'INSERT', false),
    ('service_role', 'public.inquiry_status_audit', 'UPDATE', false),
    ('service_role', 'public.inquiry_status_audit', 'DELETE', false),
    ('service_role', 'public.inquiry_status_audit', 'TRUNCATE', false)
), table_results as (
  select role_name,
         object_name,
         privilege_name,
         has_table_privilege(role_name, object_name, privilege_name) = expected
           as matches_expected
  from expected_table
), sequence_results as (
  select role_name,
         'public.inquiry_status_audit_id_seq'::text as object_name,
         privilege_name,
         has_sequence_privilege(
           role_name,
           'public.inquiry_status_audit_id_seq',
           privilege_name
         ) = false as matches_expected
  from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) privileges(privilege_name)
), public_acl as (
  select 'PUBLIC'::text as role_name,
         n.nspname || '.' || c.relname as object_name,
         a.privilege_type as privilege_name,
         false as matches_expected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault(c.relkind, c.relowner))) a
  where n.nspname = 'public'
    and c.relname in (
      'inquiries',
      'inquiry_status_audit',
      'inquiry_status_audit_id_seq'
    )
    and a.grantee = 0
)
select * from table_results
union all
select * from sequence_results
union all
select * from public_acl
order by object_name, role_name, privilege_name;
```

The query must return no `f` values. `public_acl` should return no rows. Finally,
re-run the admin RPC transaction from step 4 and the retention schema checks:

```sql
select
  has_table_privilege('service_role', 'public.inquiries', 'DELETE')
    as service_parent_delete,
  not has_table_privilege(
    'service_role',
    'public.inquiry_status_audit',
    'DELETE,TRUNCATE'
  ) as service_direct_audit_delete_denied,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inquiry_status_audit'::regclass
      and confrelid = 'public.inquiries'::regclass
      and contype = 'f'
      and confdeltype = 'c'
  ) as retention_cascade_present;
```

All three values must be `t`. This establishes that retention can delete the
parent and invoke the referential cascade without granting direct audit deletion.

## Forward-only rollback

Before `031`, roll back a failed frontend deployment to the cached legacy asset;
the `030` compatibility grant keeps it working. After `031`, **do not revert 031**
and do not restore direct `UPDATE`/`DELETE`. Roll the frontend forward to the last
known-good RPC asset or ship a numbered corrective migration. Database rollback
is fix forward only, preserving the contracted authorization boundary and audit
history.
