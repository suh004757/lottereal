import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "public" / "reports" / "2026-03-08-korea-real-estate-policy-report.html"


class PolicyReportSnippetTests(unittest.TestCase):
    def test_policy_report_title_matches_observed_search_intent_without_stale_month(self):
        html = REPORT.read_text(encoding="utf-8")

        self.assertIn(
            "<title>이재명 정부 부동산 정책 정리: 대출 규제·공급·토지거래허가 | 롯데부동산</title>",
            html,
        )
        self.assertNotIn("<title>2026년 3월 이재명 정부 부동산 정책 정리", html)


if __name__ == "__main__":
    unittest.main()
