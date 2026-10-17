from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "028_listing_closed_at.sql"


class ListingClosedMigrationTest(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_closing_is_reversible_and_never_deletes(self):
        self.assertIn("add column if not exists closed_at timestamptz", self.sql)
        self.assertIn("case when closed then coalesce(closed_at, now()) else null end", self.sql)
        self.assertNotIn("delete from", self.sql)
        self.assertNotIn("drop table", self.sql)

    def test_public_reads_hide_closed_rows_and_admin_still_sees_them(self):
        self.assertIn("to anon, authenticated\nusing (closed_at is null)", self.sql)
        self.assertIn("create policy property_listings_admin_select", self.sql)
        self.assertNotIn("grant select (closed_at)", self.sql)

    def test_only_admin_can_close_or_reopen(self):
        self.assertIn("security definer", self.sql)
        self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role'", self.sql)
        self.assertIn("revoke all on function public.admin_set_listing_closed(uuid, boolean) from public, anon", self.sql)


if __name__ == "__main__":
    unittest.main()
