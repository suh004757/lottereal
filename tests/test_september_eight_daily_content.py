import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / "content" / "daily" / "2026-09-08-songpa-jeonse-return-guarantee-precheck.json"
UPDATE_PAYLOAD = ROOT / "content" / "curated" / "2026-09-08-lease-opposability-guarantee-update.json"


class SeptemberEightDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding="utf-8"))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding="utf-8"))

    def test_new_article_has_daily_identity_sections_and_contact_path(self):
        report = self.new_report
        self.assertEqual(report["slug"], "2026-09-08-songpa-jeonse-return-guarantee-precheck")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-08")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_new_article_preserves_institution_differences_and_no_guarantee(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "수도권 전세보증금 7억원 이하",
            "주택가격의 90%",
            "HF 전세자금보증을 이용 중이거나 함께 신청",
            "간편조회 결과를 다른 기관의 확정 승인처럼",
            "특정 집의 보증 가입 가능성이나 보증금 회수를 보장하지 않습니다",
        ):
            self.assertIn(phrase, copy)
        urls = {source["url"] for source in self.new_report["evidence_json"]}
        self.assertTrue(any("khug.or.kr" in url for url in urls))
        self.assertTrue(any("hf.go.kr" in url for url in urls))
        self.assertTrue(any("easylaw.go.kr" in url for url in urls))

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report["slug"], "2026-08-23-lease-opposability-checklist")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-08-23T10:38:08.315528+00:00")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-08")
        self.assertIn("> 최초 발행: 2026년 8월 23일", report["report_md"])
        self.assertIn("> 수정·자료 확인: 2026년 9월 8일", report["report_md"])
        self.assertIn("slug=2026-09-08-songpa-jeonse-return-guarantee-precheck", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])

    def test_sitemap_and_public_copy_quality(self):
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        for report in (self.new_report, self.updated_report):
            entry = "report.html?slug=" + report["slug"]
            start = sitemap.index(entry)
            self.assertIn("<lastmod>2026-09-08</lastmod>", sitemap[start:start + 220])
        combined = self.new_report["report_md"] + self.updated_report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()