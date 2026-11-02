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

    def test_korean_page_offers_a_lease_request_that_stays_hidden_without_availability(self):
        html = (PUBLIC / "songpa-short-term-rental.html").read_text(encoding="utf-8")
        self.assertIn('<script type="module" src="js/leaseRequest.js"></script>', html)
        section = re.search(r'<section[^>]*data-lease-request hidden>(.*?)</section>', html, re.S)
        self.assertIsNotNone(section)
        body = section.group(1)
        self.assertIn(f'data-shortstay-calendar="{LISTING_ID}" hidden', body)
        for name in ("kind", "startsOn", "endsOn", "phone", "privacyConsent", "website"):
            self.assertIn(f'name="{name}"', body)
        self.assertIn('value="extension"', body)
        self.assertIn("data-lease-extension-hint hidden", body)
        self.assertIn("결제를 받지 않으며", body)
        for word in ("숙박", "입실", "체크인", "게스트", "호텔"):
            self.assertNotIn(word, body)

    def test_request_is_reachable_from_the_top_and_the_mobile_bar(self):
        html = (PUBLIC / "songpa-short-term-rental.html").read_text(encoding="utf-8")
        hero = html.index('class="shortstay-hero-cta" data-lease-request-link hidden')
        self.assertLess(hero, html.index('id="apply"'))
        actionbar = html[html.index('class="lr-mobile-actionbar shortstay-actionbar"'):]
        self.assertIn('<a href="#apply" data-lease-request-link hidden>', actionbar.split("</div>")[0])

    def test_visitors_see_a_short_listing_number_not_the_database_id(self):
        for name in ("songpa-short-term-rental.html", "songpa-short-term-rental-en.html", "songpa-short-term-rental-ja.html"):
            html = (PUBLIC / name).read_text(encoding="utf-8")
            text = re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S))
            self.assertNotIn(LISTING_ID, text, name)
            self.assertIn("ST-01", text, name)


if __name__ == "__main__":
    unittest.main()
