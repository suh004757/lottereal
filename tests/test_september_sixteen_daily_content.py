import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / "content" / "daily" / "2026-09-16-songpa-rent-index-contract-price-check.json"
UPDATE_PAYLOAD = ROOT / "content" / "daily" / "2026-09-16-existing-july-housing-stats-update.json"


class SeptemberSixteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding="utf-8"))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding="utf-8"))

    def test_new_article_has_daily_identity_sections_and_contact_path(self):
        report = self.new_report
        self.assertEqual(report["slug"], "2026-09-16-songpa-rent-index-contract-price-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-16")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_price_index_copy_is_specific_and_scope_honest(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "서울 주택종합 전세가격지수",
            "송파구는 전세 0.90%, 월세 0.84%",
            "가격지수는 표본",
            "같은 단지와 면적",
            "모든 전셋값과 월세가 그만큼 올랐다",
        ):
            self.assertIn(phrase, copy)
        urls = {source["url"] for source in self.new_report["evidence_json"]}
        self.assertTrue(any("reb.or.kr" in url for url in urls))
        self.assertNotIn("송파 전셋값이 모두", copy)
        self.assertNotIn("계약을 서둘러야", copy)

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report["slug"], "2026-09-01-july-housing-stats-songpa-contract-checklist")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-09-01T05:21:41.890205+00:00")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-16")
        self.assertIn("> 최초 발행: 2026년 9월 1일", report["report_md"])
        self.assertIn("> 수정·자료 확인: 2026년 9월 16일", report["report_md"])
        self.assertIn("slug=2026-09-16-songpa-rent-index-contract-price-check", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])

    def test_sitemap_and_public_copy_quality(self):
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
