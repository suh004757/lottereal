import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "content" / "daily" / "2026-10-17-jamsil-apartment-parking-check.json"
SLUG = "2026-10-17-jamsil-apartment-parking-check"


class OctoberSeventeenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(ARTIFACT.read_text(encoding="utf-8"))

    def test_article_has_required_sections_sources_and_contact_path(self):
        self.assertEqual(self.report["slug"], SLUG)
        self.assertEqual(self.report["metadata"]["published_at"], "2026-10-17")
        self.assertEqual(len(self.report["evidence_json"]), 2)
        self.assertTrue(all(source["checkedAt"] == "2026-10-17" for source in self.report["evidence_json"]))
        domains = {source["url"].split("/")[2] for source in self.report["evidence_json"]}
        self.assertIn("www.k-apt.go.kr", domains)
        self.assertIn("www.gov.kr", domains)
        for heading in ("## 먼저 볼 내용", "## 확인된 흐름", "## 상담 전에 확인할 점", "## 자료와 한계"):
            self.assertIn(heading, self.report["report_md"])
        self.assertIn("https://lottes.co.kr/contact.html", self.report["report_md"])
        self.assertIn("/reports/2026-10-11-jamsil-apartment-management-fee-comparison.html", self.report["report_md"])

    def test_copy_is_scope_honest_and_public_safe(self):
        combined = self.report["title"] + self.report["summary"] + self.report["report_md"]
        for phrase in ("주차를 보장", "반드시 주차", "투자 수익", "운영 기준", "API", "MCP", "프롬프트", "—"):
            self.assertNotIn(phrase, combined)
        self.assertIn("보장하지 않습니다", combined)
        self.assertIn("차량번호", combined)
        self.assertIn("개인정보", combined)

    def test_static_page_and_sitemap_are_consistent(self):
        report_html = (ROOT / "public" / "reports" / f"{SLUG}.html").read_text(encoding="utf-8")
        sitemap = (ROOT / "public" / "Sitemap.xml").read_text(encoding="utf-8")
        static_url = f"https://lottes.co.kr/reports/{SLUG}.html"
        self.assertIn(static_url, sitemap)
        self.assertNotIn("report.html?slug=", sitemap)
        self.assertIn(f'<link rel="canonical" href="{static_url}">', report_html)
        self.assertIn("잠실 아파트 주차", report_html)
        self.assertIn("K-apt", report_html)


if __name__ == "__main__":
    unittest.main()
