from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "030_harden_inquiry_status_updates.sql"
ADAPTER = ROOT / "public" / "js" / "services" / "backendAdapter.js"


class InquiryStatusSecurityMigrationTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MIGRATION.exists(), "missing forward-only inquiry permission migration")
        self.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_browser_delete_and_direct_update_are_revoked_but_retention_delete_is_preserved(self):
        self.assertRegex(
            self.sql,
            r"revoke\s+delete\s+on\s+table\s+public\.inquiries\s+from\s+authenticated",
        )
        self.assertRegex(
            self.sql,
            r"revoke\s+update\s+on\s+table\s+public\.inquiries\s+from\s+authenticated",
        )
        self.assertNotRegex(
            self.sql,
            r"grant\s+update(?:\s*\([^)]*\))?\s+on\s+table\s+public\.inquiries\s+to\s+authenticated",
        )
        self.assertRegex(
            self.sql,
            r"grant\s+delete\s+on\s+table\s+public\.inquiries\s+to\s+service_role",
        )
        self.assertIn("drop policy if exists inquiries_admin_update on public.inquiries", self.sql)
        self.assertIn("drop policy if exists inquiries_admin_delete on public.inquiries", self.sql)

    def test_status_rpc_is_admin_only_fixed_path_and_exactly_scoped(self):
        self.assertIn("create or replace function public.admin_set_inquiry_status", self.sql)
        self.assertIn("security definer", self.sql)
        self.assertIn("set search_path = pg_catalog, public, auth", self.sql)
        self.assertIn("auth.uid()", self.sql)
        self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role'", self.sql)
        self.assertIn("p_status is null or p_status not in ('unread', 'read')", self.sql)
        self.assertIn("update public.inquiries", self.sql)
        self.assertIn("set status = p_status", self.sql)
        self.assertRegex(
            self.sql,
            r"revoke\s+all\s+on\s+function\s+public\.admin_set_inquiry_status\(uuid,\s*text\)\s+from\s+public,\s*anon,\s*authenticated",
        )
        self.assertRegex(
            self.sql,
            r"grant\s+execute\s+on\s+function\s+public\.admin_set_inquiry_status\(uuid,\s*text\)\s+to\s+authenticated",
        )
        self.assertNotRegex(
            self.sql,
            r"grant\s+execute\s+on\s+function\s+public\.admin_set_inquiry_status\(uuid,\s*text\)\s+to\s+(?:anon|public)",
        )

    def test_status_changes_have_private_append_only_audit_history(self):
        self.assertIn("create table if not exists public.inquiry_status_audit", self.sql)
        self.assertIn("references public.inquiries(id) on delete cascade", self.sql)
        self.assertIn("actor_id uuid not null", self.sql)
        self.assertIn("previous_status text not null", self.sql)
        self.assertIn("new_status text not null", self.sql)
        self.assertIn("created_at timestamptz not null default now()", self.sql)
        self.assertIn("alter table public.inquiry_status_audit enable row level security", self.sql)
        self.assertIn(
            "revoke all privileges on table public.inquiry_status_audit from public, anon, authenticated",
            self.sql,
        )
        self.assertIn("grant select on table public.inquiry_status_audit to authenticated", self.sql)
        self.assertIn("create policy inquiry_status_audit_admin_select", self.sql)
        self.assertIn("insert into public.inquiry_status_audit", self.sql)
        self.assertNotRegex(
            self.sql,
            r"grant\s+(?:update|delete|insert)[^;]*public\.inquiry_status_audit\s+to\s+authenticated",
        )

    def test_frontend_uses_the_audited_rpc_instead_of_direct_table_update(self):
        source = ADAPTER.read_text(encoding="utf-8")
        match = re.search(
            r"async function updateInquiryStatusSupabase\(id, status\) \{(?P<body>.*?)\n\}",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(match, "missing Supabase inquiry status adapter")
        assert match is not None
        body = match.group("body")
        self.assertIn(".rpc('admin_set_inquiry_status', { p_inquiry_id: id, p_status: status })", body)
        self.assertNotIn(".from('inquiries')", body)
        self.assertNotIn(".update({ status })", body)


if __name__ == "__main__":
    unittest.main()
