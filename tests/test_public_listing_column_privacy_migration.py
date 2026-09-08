from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "024_minimize_public_listing_columns.sql"
AUTH_MIGRATION = ROOT / "supabase" / "migrations" / "025_harden_authenticated_listing_privacy.sql"


class PublicListingColumnPrivacyMigrationTest(unittest.TestCase):
    def test_anon_gets_only_public_listing_columns(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("revoke all privileges on table public.property_listings from anon", sql)
        match = re.search(
            r"grant\s+select\s*\((.*?)\)\s+on\s+table\s+public\.property_listings\s+to\s+anon",
            sql,
            re.DOTALL,
        )
        if match is None:
            self.fail("anon column-level SELECT grant is missing")
        granted = {part.strip() for part in match.group(1).split(",")}
        self.assertEqual(
            granted,
            {
                "id",
                "title",
                "description",
                "price",
                "currency",
                "property_type",
                "address",
                "city",
                "district",
                "latitude",
                "longitude",
                "images",
                "created_at",
            },
        )
        for private_column in ("contact_name", "contact_phone", "contact_email", "user_id"):
            self.assertNotIn(private_column, granted)

    def test_rls_remains_enabled(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("alter table public.property_listings enable row level security", sql)

    def test_authenticated_gets_only_public_columns_and_admin_uses_role_checked_rpc(self):
        sql = AUTH_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("revoke all privileges on table public.property_listings from authenticated", sql)
        self.assertIsNotNone(re.search(
            r"grant\s+select\s*\(.*?\)\s+on\s+table\s+public\.property_listings\s+to\s+authenticated",
            sql,
            re.DOTALL,
        ))
        self.assertIn("returns setof public.property_listings", sql)
        self.assertIn("security definer", sql)
        self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role'", sql)
        self.assertIn("revoke all on function public.admin_list_property_listings() from public, anon", sql)
        for private_column in ("contact_name", "contact_phone", "contact_email", "user_id"):
            grant_match = re.search(
                r"grant\s+select\s*\((.*?)\)\s+on\s+table\s+public\.property_listings\s+to\s+authenticated",
                sql,
                re.DOTALL,
            )
            if grant_match is None:
                self.fail("authenticated column-level SELECT grant is missing")
            self.assertNotIn(private_column, grant_match.group(1))

    def test_admin_adapter_uses_rpc_and_write_readbacks_use_public_projection(self):
        source = (ROOT / "js" / "services" / "backendAdapter.js").read_text(encoding="utf-8-sig")
        self.assertIn(".rpc('admin_list_property_listings'", source)
        self.assertGreaterEqual(source.count(".select(PUBLIC_LISTING_SELECT_QUERY)"), 4)
        self.assertGreaterEqual(source.count(".select('id', { count: 'exact', head: true })"), 2)


if __name__ == "__main__":
    unittest.main()
