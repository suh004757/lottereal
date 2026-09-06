import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-07-songpa-rental-contract-reporting-deadline.json"


class SeptemberSevenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-07-songpa-rental-contract-reporting-deadline")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-07")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_copy_keeps_reporting_move_in_and_confirmation_date_separate(self):
        copy = self.report["report_md"]
        for phrase in (
            "계약 체결일부터 30일",
            "보증금이 6천만원을 초과하거나 월세가 30만원을 초과",
            "실제 입주 후 해야 하는 전입신고까지 끝났다는 뜻은 아닙니다",
            "보증금과 월세 변동 없이 기간만 연장한 갱신",
        ):
            self.assertIn(phrase, copy)

    def test_sources_are_official_and_citations_are_declared(self):
        report = self.report
        urls = {source["url"] for source in report["evidence_json"]}
        self.assertTrue(any("molit.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(any("easylaw.go.kr" in url for url in urls))
        for citation in ("[1]", "[2]", "[3]", "[4]"):
            self.assertIn(citation, report["report_md"])

    def test_sitemap_and_public_copy_quality(self):
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("report.html?slug=" + self.report["slug"], sitemap)
        combined = self.report["title"] + self.report["summary"] + self.report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()