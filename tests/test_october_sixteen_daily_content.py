import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEW_ARTIFACT = ROOT / "content" / "daily" / "2026-10-16-songpa-home-purchase-funding-plan-documents.json"
UPDATE_ARTIFACT = ROOT / "content" / "daily" / "2026-10-16-existing-songpa-home-sale-transaction-reporting-update.json"
NEW_SLUG = "2026-10-16-songpa-home-purchase-funding-plan-documents"
EXISTING_SLUG = "2026-10-12-songpa-home-sale-transaction-reporting"


class OctoberSixteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new = json.loads(NEW_ARTIFACT.read_text(encoding="utf-8"))
        cls.updated = json.loads(UPDATE_ARTIFACT.read_text(encoding="utf-8"))
        cls.new_html = (ROOT / "public" / "reports" / f"{NEW_SLUG}.html").read_text(encoding="utf-8")
        cls.updated_html = (ROOT / "public" / "reports" / f"{EXISTING_SLUG}.html").read_text(encoding="utf-8")
        cls.sitemap = (ROOT / "public" / "Sitemap.xml").read_text(encoding="utf-8")

    def test_new_article_has_required_sections_sources_and_contact_path(self):
        self.assertEqual(self.new["slug"], NEW_SLUG)
        self.assertEqual(self.new["metadata"]["published_at"], "2026-10-16")
        self.assertEqual(len(self.new["evidence_json"]), 2)
        self.assertTrue(all("law.go.kr" in source["url"] for source in self.new["evidence_json"]))
        for heading in ("## 먼저 볼 내용", "## 확인된 흐름", "## 상담 전에 확인할 점", "## 자료와 한계"):
            self.assertIn(heading, self.new["report_md"])
        self.assertIn("https://lottes.co.kr/contact.html", self.new["report_md"])
        self.assertIn("주민등록번호", self.new["report_md"])
        self.assertIn("계좌번호", self.new["report_md"])

    def test_existing_url_preserves_identity_and_original_publication_date(self):
        self.assertEqual(self.updated["slug"], EXISTING_SLUG)
        self.assertEqual(self.updated["metadata"]["published_at"], "2026-10-12")
        self.assertEqual(self.updated["metadata"]["original_published_at"], "2026-10-12")
        self.assertEqual(self.updated["metadata"]["modified_at"], "2026-10-16")
        self.assertIn(f"/reports/{NEW_SLUG}.html", self.updated["report_md"])
        self.assertIn("25일", self.updated["report_md"])
        self.assertIn("30일", self.updated["report_md"])

    def test_static_pages_and_sitemap_are_consistent(self):
        new_url = f"https://lottes.co.kr/reports/{NEW_SLUG}.html"
        self.assertIn(new_url, self.sitemap)
        self.assertNotIn("report.html?slug=", self.sitemap)
        self.assertIn(f'<link rel="canonical" href="{new_url}">', self.new_html)
        self.assertIn("자금조달계획서 증빙", self.new_html)
        self.assertIn("2026-10-12", self.updated_html)
        self.assertIn("2026-10-16", self.updated_html)

    def test_copy_avoids_overclaiming_and_internal_terms(self):
        combined = self.new["title"] + self.new["summary"] + self.new["report_md"]
        for phrase in ("보장합니다", "반드시 승인", "운영 기준", "API", "MCP", "프롬프트"):
            self.assertNotIn(phrase, combined)
        self.assertIn("법률·세무 자문이 아닙니다", combined)
        self.assertIn("다시 확인", combined)


if __name__ == "__main__":
    unittest.main()
