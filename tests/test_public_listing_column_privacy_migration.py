from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "024_minimize_public_listing_columns.sql"


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


if __name__ == "__main__":
    unittest.main()
