import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


class ListingRequestCardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = (PUBLIC / "listings.html").read_text(encoding="utf-8")
        cls.script = (PUBLIC / "js" / "listingsPage.js").read_text(encoding="utf-8")

    def test_listing_grid_ends_with_request_card_built_without_html_strings(self):
        start = self.script.index("function buildRequestCard()")
        body = self.script[start:self.script.index("\n}\n", start)]
        self.assertIn("grid.appendChild(buildRequestCard());", self.script)
        self.assertIn("contact.html?intent=listing#inquiry-options", body)
        self.assertIn("SAFE_CONTACT_TEL", body)
        self.assertNotIn("innerHTML", body)

    def test_listings_hero_uses_shared_night_style(self):
        self.assertIn('class="lr-hero lr-hero--compact lr-hero--night"', self.page)
        self.assertIn('<link rel="stylesheet" href="css/home-motion.css">', self.page)
        self.assertIn("data-listings-grid", self.page)


if __name__ == "__main__":
    unittest.main()
