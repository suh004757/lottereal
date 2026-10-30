from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "032_listing_unavailable_periods.sql"
PUBLIC = ROOT / "public"
LISTING_ID = "3c04f5dd-dcb3-46ca-9332-e7cde6f9b421"


class ListingUnavailablePeriodsMigrationTest(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_table_holds_only_dates_and_never_touches_listings(self):
        create = re.search(r"create table if not exists public.listing_unavailable_periods \((.*?)\);", self.sql, re.S).group(1)
        columns = {line.strip().split()[0] for line in create.splitlines() if line.strip() and not line.strip().startswith(("constraint", "check"))}
        self.assertEqual(columns, {"id", "listing_id", "starts_on", "ends_on", "created_at"})
        self.assertIn("check (ends_on >= starts_on", self.sql)
        self.assertNotIn("on delete cascade", self.sql)
        self.assertNotIn("update public.property_listings", self.sql)
        self.assertNotIn("drop table", self.sql)

    def test_public_can_read_dates_but_only_admin_can_write(self):
        self.assertIn("enable row level security", self.sql)
        self.assertIn("revoke all on table public.listing_unavailable_periods from public, anon, authenticated", self.sql)
        self.assertNotRegex(self.sql, r"grant (insert|delete|update)[^;]*to anon")
        self.assertNotIn("grant update", self.sql)
        for policy in ("admin_insert", "admin_delete"):
            body = re.search(rf"create policy listing_unavailable_periods_{policy}(.*?);", self.sql, re.S).group(1)
            self.assertIn("to authenticated", body)
            self.assertIn("auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'", body)

    def test_every_static_move_in_label_is_wired_to_the_live_calendar(self):
        pages = (
            "songpa-short-term-rental.html", "songpa-short-term-rental-en.html", "songpa-short-term-rental-ja.html",
            "short-term-rentals-en.html", "short-term-rentals-ja.html",
        )
        for name in pages:
            html = (PUBLIC / name).read_text(encoding="utf-8")
            self.assertIn('<script type="module" src="js/shortStayCalendar.js"></script>', html, name)
            self.assertIn(f'data-shortstay-availability="{LISTING_ID}"', html, name)
            if name.startswith("songpa-"):
                self.assertIn(f'data-shortstay-calendar="{LISTING_ID}" hidden', html, name)
                self.assertIn("data-calendar-grid", html, name)


if __name__ == "__main__":
    unittest.main()
