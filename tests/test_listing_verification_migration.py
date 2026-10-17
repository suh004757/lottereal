from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "027_listing_last_verified_at.sql"


class ListingVerificationMigrationTest(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_adds_nullable_column_and_grants_only_that_column(self):
        self.assertIn("add column if not exists last_verified_at timestamptz", self.sql)
        grants = re.findall(r"grant\s+select\s*\(([^)]*)\)\s+on\s+table\s+public\.property_listings", self.sql)
        self.assertEqual([g.strip() for g in grants], ["last_verified_at"])
        for private_column in ("contact_name", "contact_phone", "contact_email", "user_id"):
            self.assertNotIn(private_column, self.sql)

    def test_only_admin_can_confirm_through_role_checked_function(self):
        self.assertIn("security definer", self.sql)
        self.assertIn("set search_path = pg_catalog, public, auth", self.sql)
        self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role'", self.sql)
        self.assertIn("set last_verified_at = now()", self.sql)
        self.assertIn("revoke all on function public.admin_confirm_listing_available(uuid) from public, anon", self.sql)
        self.assertNotRegex(self.sql, r"grant\s+update")
        self.assertNotIn("delete", self.sql)


if __name__ == "__main__":
    unittest.main()
