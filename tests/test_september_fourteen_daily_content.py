import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / "content" / "daily" / "2026-09-14-songpa-trust-registration-lease-check.json"
UPDATE_PAYLOAD = ROOT / "content" / "daily" / "2026-09-14-existing-lease-rights-update.json"


class SeptemberFourteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding="utf-8"))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding="utf-8"))

    def test_new_article_has_daily_identity_sections_and_contact_path(self):
        report = self.new_report
        self.assertEqual(report["slug"], "2026-09-14-songpa-trust-registration-lease-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-14")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_trust_checklist_is_specific_and_source_grounded(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "등기사항증명서 갑구",
            "신탁원부",
            "수탁자의 사전 승낙",
            "보증금 수령 계좌",
            "계약금부터 서두르지",
        ):
            self.assertIn(phrase, copy)
        urls = {source["url"] for source in self.new_report["evidence_json"]}
        for domain in ("irts.molit.go.kr", "law.go.kr", "khug.or.kr"):
            self.assertTrue(any(domain in url for url in urls))
        self.assertNotIn("신탁등기면 무조건", copy)
        self.assertNotIn("보증금 회수를 보장", copy)

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report["slug"], "2026-08-23-lease-opposability-checklist")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-08-23T10:38:08.315528+00:00")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-14")
        self.assertIn("> 최초 발행: 2026년 8월 23일", report["report_md"])
        self.assertIn("> 수정·자료 확인: 2026년 9월 14일", report["report_md"])
        self.assertIn("slug=2026-09-14-songpa-trust-registration-lease-check", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])

    def test_sitemap_and_public_copy_quality(self):
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        for report in (self.new_report, self.updated_report):
            entry = "reports/" + report["slug"] + ".html"
            start = sitemap.index(entry)
            self.assertRegex(sitemap[start:start + 220], r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")
        combined = self.new_report["report_md"] + self.updated_report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
