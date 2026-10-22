from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
EXPAND = ROOT / "supabase" / "migrations" / "030_harden_inquiry_status_updates.sql"
CONTRACT = ROOT / "supabase" / "migrations" / "031_contract_inquiry_status_writes.sql"
ADAPTER = ROOT / "public" / "js" / "services" / "backendAdapter.js"
RUNBOOK = ROOT / "docs" / "engineering" / "inquiry-status-hardening-rollout.md"


def sql_fences(markdown):
    return re.findall(r"```sql\n(.*?)```", markdown, re.DOTALL | re.IGNORECASE)


class InquiryStatusSecurityMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.expand = EXPAND.read_text(encoding="utf-8").lower()
        cls.adapter = ADAPTER.read_text(encoding="utf-8")

    def test_030_is_expand_only_and_keeps_legacy_authenticated_update(self):
        self.assertIn("grant update on table public.inquiries to authenticated", self.expand)
        self.assertNotRegex(
            self.expand,
            r"revoke\s+(?:all privileges|update|delete)[^;]*on\s+table\s+public\.inquiries",
        )
        self.assertNotRegex(
            self.expand,
            r"drop\s+policy[^;]*on\s+public\.inquiries",
        )

    def test_030_validates_the_audit_shape_and_cascade_contract(self):
        self.assertIn("create table if not exists public.inquiry_status_audit", self.expand)
        self.assertIn("references public.inquiries(id) on delete cascade", self.expand)
        self.assertIn("pg_get_serial_sequence('public.inquiry_status_audit', 'id')", self.expand)
        self.assertIn("confdeltype = 'c'", self.expand)
        self.assertIn(
            "conname in (\n         'inquiry_status_audit_previous_status_check',",
            self.expand,
        )
        self.assertIn("having count(*) = 3", self.expand)
        self.assertIn("column_default = 'now()'", self.expand)
        self.assertIn("raise exception 'inquiry_status_audit schema validation failed'", self.expand)
        self.assertIn("alter table public.inquiry_status_audit owner to postgres", self.expand)

    def test_migrations_require_the_exact_retention_foreign_key_mapping(self):
        for path in (EXPAND, CONTRACT):
            sql = path.read_text(encoding="utf-8").lower()
            with self.subTest(migration=path.name):
                self.assertRegex(
                    sql,
                    r"conkey\s*=\s*array\[\s*\(select attnum from pg_attribute\s*"
                    r"where attrelid = 'public\.inquiry_status_audit'::regclass\s*"
                    r"and attname = 'inquiry_id'\)\s*\]::smallint\[\]",
                )
                self.assertRegex(
                    sql,
                    r"confkey\s*=\s*array\[\s*\(select attnum from pg_attribute\s*"
                    r"where attrelid = 'public\.inquiries'::regclass\s*"
                    r"and attname = 'id'\)\s*\]::smallint\[\]",
                )

    def test_migrations_set_and_verify_audit_object_owners(self):
        for path in (EXPAND, CONTRACT):
            sql = path.read_text(encoding="utf-8").lower()
            with self.subTest(migration=path.name):
                self.assertIn("alter table public.inquiry_status_audit owner to postgres", sql)
                self.assertIn("alter sequence public.inquiry_status_audit_id_seq owner to postgres", sql)
                self.assertIn(
                    "alter function public.admin_set_inquiry_status(uuid, text) owner to postgres",
                    sql,
                )
                self.assertIn("raise exception 'inquiry hardening owner validation failed'", sql)
                self.assertIn("c.relowner <> 'postgres'::regrole", sql)
                self.assertIn("p.proowner <> 'postgres'::regrole", sql)

    def test_030_repairs_private_table_and_sequence_acls_deterministically(self):
        self.assertIn(
            "revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated, service_role",
            self.expand,
        )
        self.assertIn(
            "grant select on table public.inquiry_status_audit to authenticated, service_role",
            self.expand,
        )
        self.assertIn(
            "revoke all privileges on sequence public.inquiry_status_audit_id_seq from public, anon, authenticated, service_role",
            self.expand,
        )
        self.assertNotRegex(
            self.expand,
            r"grant\s+(?:insert|update|delete|truncate)[^;]*inquiry_status_audit",
        )
        self.assertNotRegex(self.expand, r"grant\s+[^;]*inquiry_status_audit_id_seq")

    def test_030_revokes_unexpected_audit_object_acl_grantees(self):
        self.assertIn("aclexplode", self.expand)
        self.assertIn("a.grantee <> c.relowner", self.expand)
        self.assertIn("a.grantee <> p.proowner", self.expand)
        self.assertIn(
            "revoke all privileges on table public.inquiry_status_audit from %i",
            self.expand,
        )
        self.assertIn(
            "revoke all privileges on sequence public.inquiry_status_audit_id_seq from %i",
            self.expand,
        )
        self.assertIn(
            "revoke all privileges on function public.admin_set_inquiry_status(uuid, text) from %i",
            self.expand,
        )

    def test_030_rpc_has_fixed_owner_path_and_exact_execute_acl(self):
        self.assertIn("create or replace function public.admin_set_inquiry_status", self.expand)
        self.assertIn("security definer", self.expand)
        self.assertIn("set search_path = ''", self.expand)
        self.assertIn("auth.uid()", self.expand)
        self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role'", self.expand)
        self.assertIn("p_status is null or p_status not in ('unread', 'read')", self.expand)
        self.assertIn("update public.inquiries", self.expand)
        self.assertIn("insert into public.inquiry_status_audit", self.expand)
        self.assertIn(
            "alter function public.admin_set_inquiry_status(uuid, text) owner to postgres",
            self.expand,
        )
        self.assertRegex(
            self.expand,
            r"revoke\s+all\s+on\s+function\s+public\.admin_set_inquiry_status\(uuid,\s*text\)\s+from\s+public,\s*anon,\s*authenticated,\s*service_role",
        )
        self.assertRegex(
            self.expand,
            r"grant\s+execute\s+on\s+function\s+public\.admin_set_inquiry_status\(uuid,\s*text\)\s+to\s+authenticated",
        )

    def test_frontend_uses_the_audited_rpc(self):
        match = re.search(
            r"async function updateInquiryStatusSupabase\(id, status\) \{(?P<body>.*?)\n\}",
            self.adapter,
            re.DOTALL,
        )
        self.assertIsNotNone(match, "missing Supabase inquiry status adapter")
        assert match is not None
        body = match.group("body")
        self.assertIn(".rpc('admin_set_inquiry_status', { p_inquiry_id: id, p_status: status })", body)
        self.assertNotIn(".from('inquiries')", body)
        self.assertNotIn(".update({ status })", body)

    def test_031_contract_repairs_parent_acl_and_drops_direct_write_policies(self):
        self.assertTrue(CONTRACT.exists(), "missing contract migration 031")
        sql = CONTRACT.read_text(encoding="utf-8").lower()
        self.assertIn(
            "revoke all privileges on table public.inquiries from public, anon, authenticated, service_role",
            sql,
        )
        self.assertIn("grant insert on table public.inquiries to anon", sql)
        self.assertIn("grant select on table public.inquiries to authenticated", sql)
        self.assertIn("grant select, delete on table public.inquiries to service_role", sql)
        self.assertIn("cmd in ('all', 'update', 'delete')", sql)
        self.assertNotRegex(sql, r"grant\s+update[^;]*public\.inquiries")
        self.assertNotRegex(sql, r"grant\s+delete[^;]*public\.inquiries\s+to\s+(?:public|anon|authenticated)")

    def test_031_blocks_direct_audit_mutation_but_preserves_retention_cascade(self):
        sql = CONTRACT.read_text(encoding="utf-8").lower()
        self.assertIn(
            "revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated, service_role",
            sql,
        )
        self.assertIn(
            "grant select on table public.inquiry_status_audit to authenticated, service_role",
            sql,
        )
        self.assertIn(
            "revoke all privileges on sequence public.inquiry_status_audit_id_seq from public, anon, authenticated, service_role",
            sql,
        )
        self.assertIn("on delete cascade", sql)
        self.assertNotRegex(
            sql,
            r"grant\s+(?:insert|update|delete|truncate)[^;]*inquiry_status_audit",
        )

    def test_031_revokes_every_unexpected_non_owner_acl_grantee(self):
        sql = CONTRACT.read_text(encoding="utf-8").lower()
        self.assertIn("aclexplode", sql)
        self.assertIn("a.grantee <> c.relowner", sql)
        self.assertIn("a.grantee <> p.proowner", sql)
        self.assertIn("revoke all privileges on table public.%i from %i", sql)
        self.assertIn("revoke all privileges on sequence public.inquiry_status_audit_id_seq from %i", sql)
        self.assertIn("revoke all privileges on function public.admin_set_inquiry_status(uuid, text) from %i", sql)

    def test_runbook_rpc_probe_never_locks_as_the_caller(self):
        runbook = RUNBOOK.read_text(encoding="utf-8").lower()
        probe = next(block for block in sql_fences(runbook) if "admin rpc probe: ok" in block)
        self.assertNotIn("for update", probe)
        self.assertEqual(self.expand.count("for update"), 1)

    def test_runbook_has_rolled_back_service_role_cascade_behavior_probe(self):
        runbook = RUNBOOK.read_text(encoding="utf-8").lower()
        probe = next(
            block for block in sql_fences(runbook)
            if "service_role retention cascade probe: ok" in block
        )
        self.assertIn("begin;", probe)
        self.assertIn("set local role service_role", probe)
        self.assertIn("update public.inquiry_status_audit", probe)
        self.assertIn("delete from public.inquiry_status_audit", probe)
        self.assertGreaterEqual(probe.count("when insufficient_privilege then"), 2)
        self.assertIn("delete from public.inquiries", probe)
        self.assertIn("if exists", probe)
        self.assertIn("rollback;", probe)
        self.assertNotRegex(probe, r"raise\s+(?:notice|warning|log).*%")

    def test_runbook_verifies_owners_exact_fk_and_all_non_owner_acl_grantees(self):
        runbook = RUNBOOK.read_text(encoding="utf-8").lower()
        self.assertIn("table_owner_postgres", runbook)
        self.assertIn("sequence_owner_postgres", runbook)
        self.assertIn("rpc_owner_postgres", runbook)
        self.assertIn("conkey", runbook)
        self.assertIn("confkey", runbook)
        self.assertIn("unexpected_acl", runbook)
        self.assertIn("a.grantee <> c.relowner", runbook)
        self.assertIn("a.grantee <> p.proowner", runbook)

    def test_runbook_enforces_order_no_pii_probes_and_forward_only_rollback(self):
        self.assertTrue(RUNBOOK.exists(), "missing inquiry hardening rollout runbook")
        text = RUNBOOK.read_text(encoding="utf-8")
        lower = text.lower()
        ordered = [
            "apply migration 030",
            "verify 030 readiness",
            "deploy the rpc frontend",
            "verify the admin rpc",
            "apply migration 031",
            "verify the live role matrix",
        ]
        positions = [lower.index(step) for step in ordered]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("rollback;", lower)
        self.assertIn("no customer row or identifier is printed", lower)
        self.assertIn("do not revert 031", lower)
        self.assertIn("fix forward", lower)
        self.assertIn("has_table_privilege", lower)
        self.assertIn("has_sequence_privilege", lower)
        self.assertIn("admin rpc probe: ok", lower)


if __name__ == "__main__":
    unittest.main()
