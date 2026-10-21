import unittest
from pathlib import Path
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[1]
REPORT_HUB = ROOT / "public" / "report.html"
LEASE_ORDER_PATH = "reports/2026-08-23-lease-opposability-checklist.html"
LEASE_ORDER_REPORT = ROOT / "public" / LEASE_ORDER_PATH


class LeaseOrderInternalLinkExperimentTests(unittest.TestCase):
    def test_report_hub_surfaces_observed_lease_order_search_intent_before_archive(self):
        html = REPORT_HUB.read_text(encoding="utf-8")
        link = f'href="{LEASE_ORDER_PATH}"'

        self.assertEqual(2, html.count(link))
        self.assertLess(html.index(link), html.index("<!-- STATIC_REPORT_ARCHIVE_START -->"))
        self.assertIn("전입신고와 확정일자, 어떤 순서로 확인할까요?", html)
        self.assertIn("전입신고·확정일자 순서 보기", html)
        self.assertEqual(
            "https://lottes.co.kr/reports/2026-08-23-lease-opposability-checklist.html",
            urljoin("https://lottes.co.kr/report.html", LEASE_ORDER_PATH),
        )
        self.assertTrue(LEASE_ORDER_REPORT.exists())


if __name__ == "__main__":
    unittest.main()
