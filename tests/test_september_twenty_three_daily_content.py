import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-23-songpa-apartment-long-term-repair-fund-refund.json"


class SeptemberTwentyThreeDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-23-songpa-apartment-long-term-repair-fund-refund")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-23")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_refund_scope_is_specific_and_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "집주인에게 납부액 반환을 요청",
            "관리주체는 사용자가 납부 확인을 요구하면",
            "관리비 전체를 돌려받는 것은 아닙니다",
            "관리사무소에 세입자 납부기간과 총액이 적힌 납부확인서",
            "모든 빌라·다가구주택이나 모든 관리비",
        ):
            self.assertIn(phrase, copy)
        self.assertNotIn("무조건 돌려받", copy)
        self.assertNotIn("자동으로 반환", copy)

    def test_sources_and_sitemap(self):
        urls = {source["url"] for source in self.report["evidence_json"]}
        self.assertTrue(any("law.go.kr" in url for url in urls))
        self.assertTrue(any("easylaw.go.kr" in url for url in urls))
        self.assertTrue(all(source.get("checkedAt") == "2026-09-23" for source in self.report["evidence_json"]))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        entry = "reports/" + self.report["slug"] + ".html"
        start = sitemap.index(entry)
        self.assertRegex(sitemap[start:start + 240], r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")

    def test_public_copy_quality(self):
        copy = self.report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, copy)


if __name__ == "__main__":
    unittest.main()
