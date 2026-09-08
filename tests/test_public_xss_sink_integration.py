from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PublicXssSinkIntegrationTest(unittest.TestCase):
    def test_listing_detail_escapes_text_lists_and_validates_every_image_url(self):
        source = (ROOT / "js" / "listingDetail.js").read_text(encoding="utf-8")
        self.assertIn("from './publicRenderSecurity.mjs'", source)
        self.assertIn("escapeHtml(t)", source)
        self.assertIn("escapeHtml(f)", source)
        self.assertIn("safeImageUrl", source)
        self.assertNotIn("mainImageEl.src = images[0]", source)
        self.assertNotIn("src=\"${image}\"", source)

    def test_feed_widget_escapes_db_text_and_allows_only_http_links(self):
        source = (ROOT / "js" / "feedsWidget.js").read_text(encoding="utf-8")
        self.assertIn("from './publicRenderSecurity.mjs'", source)
        self.assertIn("safeExternalHttpUrl(item.url)", source)
        self.assertIn("escapeHtml(mapSource(item.source))", source)
        self.assertIn("escapeHtml(item.title)", source)
        self.assertIn("escapeHtml(item.summary", source)
        self.assertNotIn('href="${item.url}"', source)

    def test_report_page_initializes_even_when_module_loads_after_dom_content_loaded(self):
        source = (ROOT / "js" / "reportPage.js").read_text(encoding="utf-8")
        self.assertIn("document.readyState === 'loading'", source)
        self.assertIn("initReportPage", source)
        self.assertIn("DOMContentLoaded", source)

    def test_latest_report_refetches_full_body_by_slug(self):
        source = (ROOT / "js" / "services" / "reportAdapter.js").read_text(encoding="utf-8")
        self.assertIn("latest?.slug ? getReportBySlug(latest.slug) : null", source)


if __name__ == "__main__":
    unittest.main()
