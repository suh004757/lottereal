import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-17-songpa-move-in-household-certificate-check.json"


class SeptemberSeventeenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-17-songpa-move-in-household-certificate-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-17")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_scope_is_specific_and_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "방문 신청이 원칙",
            "건물 전체 기준",
            "타 전세계약체결내역 확인서",
            "확정일자 부여현황",
            "보증금 액수까지 적히지는 않습니다",
        ):
            self.assertIn(phrase, copy)
        self.assertNotIn("전입세대확인서만 있으면 안전", copy)
        self.assertNotIn("보증금이 보장", copy)

    def test_sources_and_sitemap(self):
        urls = {source["url"] for source in self.report["evidence_json"]}
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(any("khug.or.kr" in url for url in urls))
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
