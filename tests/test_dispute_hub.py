import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class DisputeHubTest(unittest.TestCase):
    def test_dispute_hub_has_tracking_dynamic_report_loader_and_clear_copy(self):
        text = (REPO / 'disputes.html').read_text(encoding='utf-8')
        required = (
            'data-report-landing="dispute-cases"',
            '계약·분쟁 사례',
            'js/reportLandingPage.js',
            'js/analyticsEvents.js',
            'wcs_add["wa"] = "1a98a7eafcb1eb0"',
        )
        self.assertEqual([marker for marker in required if marker not in text], [])

    def test_core_korean_navigation_links_to_dispute_hub(self):
        missing = []
        for name in ('index.html', 'listings.html', 'report.html', 'contact.html'):
            text = (REPO / name).read_text(encoding='utf-8', errors='ignore')
            if 'href="disputes.html"' not in text:
                missing.append(name)
        self.assertEqual(missing, [])

    def test_dispute_landing_requires_dispute_case_content_type(self):
        config = (REPO / 'js/config/reportLandingConfig.js').read_text(encoding='utf-8')
        self.assertIn("key: 'dispute-cases'", config)
        self.assertIn("requiredContentTypes: ['dispute_case']", config)


if __name__ == '__main__':
    unittest.main()
