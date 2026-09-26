import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / "content" / "daily" / "2026-09-18-songpa-lease-change-cancellation-report.json"
UPDATE_PAYLOAD = ROOT / "content" / "daily" / "2026-09-18-existing-lease-reporting-update.json"


class SeptemberEighteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding="utf-8"))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding="utf-8"))

    def test_new_article_identity_sections_and_contact_path(self):
        report = self.new_report
        self.assertEqual(report["slug"], "2026-09-18-songpa-lease-change-cancellation-report")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-18")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_change_and_cancellation_scope_is_specific(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "변경 또는 해제가 확정된 날부터 30일",
            "보증금 6천만원 초과 또는 월세 30만원 초과",
            "기간만 연장한 갱신은 대상에서 제외",
            "주택 임대차 계약 신고 이력조회",
        ):
            self.assertIn(phrase, copy)
        self.assertNotIn("입주일부터 30일", copy)
        self.assertNotIn("계약 해제만 하면 신고가 자동", copy)

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report["slug"], "2026-09-07-songpa-rental-contract-reporting-deadline")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-09-06T23:51:23.711811+00:00")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-18")
        self.assertIn("> 최초 발행: 2026년 9월 7일", report["report_md"])
        self.assertIn("> 수정·자료 확인: 2026년 9월 18일", report["report_md"])
        self.assertIn("slug=2026-09-18-songpa-lease-change-cancellation-report", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])

    def test_sources_sitemap_and_public_copy_quality(self):
        urls = {source["url"] for source in self.new_report["evidence_json"]}
        self.assertTrue(any("law.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        for report in (self.new_report, self.updated_report):
            entry = "reports/" + report["slug"] + ".html"
            start = sitemap.index(entry)
            self.assertRegex(sitemap[start:start + 240], r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")
        combined = self.new_report["report_md"] + self.updated_report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
