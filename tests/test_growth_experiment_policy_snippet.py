import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "public" / "reports" / "2026-03-08-korea-real-estate-policy-report.html"


class PolicyReportSnippetTests(unittest.TestCase):
    def test_policy_report_title_targets_broad_policy_overview_without_stale_month(self):
        # Search Console 2026-09-23..10-21: nearly every query reaching this page is a
        # form of "이재명 (정부) 부동산 정책 정리", often with "2025 2026". The title keeps
        # those words while describing the page as a two-year overview, not one month.
        html = REPORT.read_text(encoding="utf-8")
        title = html.split("<title>", 1)[1].split("</title>", 1)[0]

        for term in ("이재명 정부", "부동산 정책 정리", "2025", "2026"):
            self.assertIn(term, title)
        self.assertNotIn("2026년 3월", title)


if __name__ == "__main__":
    unittest.main()
