import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "content/daily/2026-09-26-songpa-land-use-plan-check.json"


class SeptemberTwentySixDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))

    def test_identity_sections_and_contact(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-26-songpa-land-use-plan-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-26")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_document_roles_are_not_conflated(self):
        copy = self.report["report_md"]
        for phrase in (
            "도시계획 결정과 행위 제한",
            "등기사항증명서와 건축물대장을 대신하지도 않습니다",
            "소유자와 근저당권",
            "위반건축물 표시",
            "사업 확정으로 읽으면 안 됩니다",
        ):
            self.assertIn(phrase, copy)
        for forbidden in ("보장합니다", "확실히", "무조건", "—", "운영 기준", "API", "MCP"):
            self.assertNotIn(forbidden, copy)

    def test_sources_and_sitemap(self):
        urls = {item["url"] for item in self.report["evidence_json"]}
        self.assertTrue(any("eum.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(all(item.get("checkedAt") == "2026-09-26" for item in self.report["evidence_json"]))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        start = sitemap.index("report.html?slug=" + self.report["slug"])
        self.assertIn("<lastmod>2026-09-26</lastmod>", sitemap[start:start + 240])


if __name__ == "__main__":
    unittest.main()
