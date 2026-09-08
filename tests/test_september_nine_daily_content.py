import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-09-songpa-rental-deposit-payee-check.json"


class SeptemberNineDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-09-songpa-rental-deposit-payee-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-09")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_payment_and_proxy_checks_are_specific_and_sourced(self):
        copy = self.report["report_md"]
        for phrase in (
            "임대인 명의 계좌",
            "보증금 수령 권한",
            "위임장 인감과 인감증명서",
            "송금부터 서두르지 마세요",
            "보증금 안전 보장이나 특정 계약 권유가 아닙니다",
        ):
            self.assertIn(phrase, copy)
        urls = {source["url"] for source in self.report["evidence_json"]}
        self.assertGreaterEqual(len(urls), 2)
        self.assertTrue(any("khug.or.kr" in url for url in urls))
        self.assertTrue(any("easylaw.go.kr" in url for url in urls))

    def test_sitemap_and_public_copy_quality(self):
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        entry = "report.html?slug=" + self.report["slug"]
        start = sitemap.index(entry)
        self.assertIn("<lastmod>2026-09-09</lastmod>", sitemap[start:start + 220])
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, self.report["report_md"])


if __name__ == "__main__":
    unittest.main()