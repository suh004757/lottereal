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
        self.assertEqual(text.count('href="disputes.html" class="active"'), 1)
        self.assertNotIn('<a href="disputes.html">계약·분쟁 사례</a>\n        <a href="disputes.html" class="active"', text)

    def test_report_shell_can_switch_to_dispute_sources_and_legal_disclaimer(self):
        html = (REPO / 'report.html').read_text(encoding='utf-8', errors='ignore')
        script = (REPO / 'js/reportPage.js').read_text(encoding='utf-8')
        for marker in ('id="report-source-summary"', 'id="report-disclaimer-primary"', 'id="report-disclaimer-footer"'):
            self.assertIn(marker, html)
        self.assertIn("type === 'dispute_case'", script)
        self.assertIn("return '계약·분쟁 사례'", script)

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

    def test_dispute_hub_lists_every_published_case_without_low_view_counts(self):
        script = (REPO / 'js/reportLandingPage.js').read_text(encoding='utf-8')
        self.assertIn("config.key === 'dispute-cases' ? listReports.length : 6", script)
        self.assertIn('renderReportList(listReports.slice(0, listLimit))', script)
        self.assertNotIn('.slice(0, 6)', script)
        self.assertNotIn('report.view_count', script)
        self.assertIn("'판례·법령 검증'", script)


if __name__ == '__main__':
    unittest.main()
