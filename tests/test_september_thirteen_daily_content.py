import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / "content" / "daily" / "2026-09-13-songpa-landlord-tax-certificate-check.json"
UPDATE_PAYLOAD = ROOT / "content" / "daily" / "2026-09-13-existing-registry-checklist-update.json"


class SeptemberThirteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding="utf-8"))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding="utf-8"))

    def test_new_article_has_daily_identity_sections_and_contact_path(self):
        report = self.new_report
        self.assertEqual(report["slug"], "2026-09-13-songpa-landlord-tax-certificate-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-13")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_tax_check_timing_is_specific_and_source_grounded(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "국세·지방세 납세증명서",
            "보증금이 1천만원을 넘는 계약",
            "임대차기간이 시작되는 날까지",
            "신분증과 임대차계약서 사본",
            "등기부만으로 드러나지 않을 수 있습니다",
        ):
            self.assertIn(phrase, copy)
        urls = {source["url"] for source in self.new_report["evidence_json"]}
        for domain in ("easylaw.go.kr", "mois.go.kr", "khug.or.kr"):
            self.assertTrue(any(domain in url for url in urls))
        self.assertNotIn("송파 미납세금이 늘", copy)
        self.assertNotIn("보증금 회수를 보장", copy)

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report["slug"], "2026-09-12-songpa-registry-before-balance-check")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-09-11T23:51:05.920877+00:00")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-13")
        self.assertIn("> 최초 발행: 2026년 9월 12일", report["report_md"])
        self.assertIn("> 수정·자료 확인: 2026년 9월 13일", report["report_md"])
        self.assertIn("slug=2026-09-13-songpa-landlord-tax-certificate-check", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])

    def test_sitemap_and_public_copy_quality(self):
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        for report in (self.new_report, self.updated_report):
            entry = "report.html?slug=" + report["slug"]
            start = sitemap.index(entry)
            self.assertIn("<lastmod>2026-09-13</lastmod>", sitemap[start:start + 220])
        combined = self.new_report["report_md"] + self.updated_report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
