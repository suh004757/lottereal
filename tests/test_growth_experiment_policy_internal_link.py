import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_HUB = ROOT / "public" / "report.html"
POLICY_PATH = "reports/2026-03-08-korea-real-estate-policy-report.html"


class PolicyInternalLinkExperimentTests(unittest.TestCase):
    def test_report_hub_surfaces_observed_policy_search_intent_before_archive(self):
        html = REPORT_HUB.read_text(encoding="utf-8")
        link = f'href="{POLICY_PATH}"'

        self.assertEqual(2, html.count(link))
        self.assertLess(html.index(link), html.index("<!-- STATIC_REPORT_ARCHIVE_START -->"))
        self.assertIn("대출·공급·토지거래허가 정책 정리", html)
        self.assertIn("발표된 계획과 현재 확인할 절차를 나눠", html)


if __name__ == "__main__":
    unittest.main()
