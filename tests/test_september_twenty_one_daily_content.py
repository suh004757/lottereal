import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-21-songpa-brokerage-fee-calculation.json"


class SeptemberTwentyOneDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-21-songpa-brokerage-fee-calculation")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-21")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_calculation_scope_is_specific_and_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "상한요율은 반드시 받아야 하는 고정요율이 아니라",
            "전세 5억원은 최대 150만원",
            "전세 8억원은 최대 320만원",
            "보증금 + 월세 × 100",
            "최대 금액은 75만원",
            "별도 약정이 없다면 거래대금 지급이 완료된 날",
            "부가가치세가 별도",
        ):
            self.assertIn(phrase, copy)
        self.assertNotIn("무조건 내야", copy)
        self.assertNotIn("수익을 보장", copy)

    def test_sources_and_sitemap(self):
        urls = {source["url"] for source in self.report["evidence_json"]}
        self.assertTrue(any("land.seoul.go.kr" in url for url in urls))
        self.assertTrue(any("공인중개사법시행규칙/제20조" in url for url in urls))
        self.assertTrue(any("공인중개사법시행령/제27조의2" in url for url in urls))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        entry = "report.html?slug=" + self.report["slug"]
        start = sitemap.index(entry)
        self.assertIn("<lastmod>2026-09-21</lastmod>", sitemap[start:start + 240])

    def test_public_copy_quality(self):
        copy = self.report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, copy)


if __name__ == "__main__":
    unittest.main()
