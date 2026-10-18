import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_ARTIFACT = ROOT / "content" / "daily" / "2026-10-18-samjeon-seokchon-villa-elevator-check.json"
EXISTING_ARTIFACT = ROOT / "content" / "daily" / "2026-10-18-existing-samjeon-seokchon-villa-price-update.json"
NEW_SLUG = "2026-10-18-samjeon-seokchon-villa-elevator-check"
EXISTING_SLUG = "2026-09-28-samjeon-seokchon-villa-price-reading"


class OctoberEighteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_ARTIFACT.read_text(encoding="utf-8"))
        cls.existing_report = json.loads(EXISTING_ARTIFACT.read_text(encoding="utf-8"))

    def test_new_article_is_source_grounded_and_public_safe(self):
        report = self.new_report
        self.assertEqual(report["slug"], NEW_SLUG)
        self.assertEqual(report["metadata"]["published_at"], "2026-10-18")
        self.assertEqual(report["metadata"]["original_published_at"], "2026-10-18")
        self.assertEqual(validate_report_copy(report), [])
        self.assertEqual(len(report["evidence_json"]), 3)
        self.assertTrue(all(source["checkedAt"] == "2026-10-18" for source in report["evidence_json"]))
        domains = {source["url"].split("/")[2] for source in report["evidence_json"]}
        self.assertEqual(domains, {"www.elevator.go.kr", "www.law.go.kr", "www.gov.kr"})
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])
        self.assertIn(f"/reports/{EXISTING_SLUG}.html", report["report_md"])
        combined = report["title"] + report["summary"] + report["report_md"]
        for phrase in ("투자 수익", "운영 기준", "API", "MCP", "프롬프트", "—"):
            self.assertNotIn(phrase, combined)
        self.assertIn("보장하지 않습니다", combined)

    def test_existing_url_keeps_identity_and_links_back(self):
        report = self.existing_report
        self.assertEqual(report["slug"], EXISTING_SLUG)
        self.assertEqual(report["metadata"]["published_at"], "2026-09-28")
        self.assertEqual(report["metadata"]["original_published_at"], "2026-09-28")
        self.assertEqual(report["metadata"]["modified_at"], "2026-10-18")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn(f"/reports/{NEW_SLUG}.html", report["report_md"])

    def test_static_pages_and_sitemap_are_consistent(self):
        sitemap = (ROOT / "public" / "Sitemap.xml").read_text(encoding="utf-8")
        for slug, visible_text in (
            (NEW_SLUG, "삼전·석촌 빌라 엘리베이터"),
            (EXISTING_SLUG, "검사·자체점검 이력"),
        ):
            report_html = (ROOT / "public" / "reports" / f"{slug}.html").read_text(encoding="utf-8")
            static_url = f"https://lottes.co.kr/reports/{slug}.html"
            self.assertIn(static_url, sitemap)
            self.assertIn(f'<link rel="canonical" href="{static_url}">', report_html)
            self.assertIn(visible_text, report_html)
        self.assertNotIn("report.html?slug=", sitemap)


if __name__ == "__main__":
    unittest.main()
