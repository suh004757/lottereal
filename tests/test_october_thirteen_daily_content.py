import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEW_REPORT = ROOT / "public/reports/2026-10-13-home-area-terms-guide.html"
EXISTING_REPORT = ROOT / "public/reports/2026-10-05-samjeon-seokchon-villa-land-share-area.html"
SITEMAP = ROOT / "public/Sitemap.xml"


class OctoberThirteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = NEW_REPORT.read_text(encoding="utf-8")
        cls.existing_report = EXISTING_REPORT.read_text(encoding="utf-8")
        cls.sitemap = SITEMAP.read_text(encoding="utf-8")

    def test_new_static_report_identity_and_sections(self):
        self.assertIn("<h1>2026년 10월 13일 집 면적 84㎡, 전용면적과 공용면적은 왜 다를까요?</h1>", self.new_report)
        self.assertIn(
            '<link rel="canonical" href="https://lottes.co.kr/reports/2026-10-13-home-area-terms-guide.html">',
            self.new_report,
        )
        for section in ("먼저 볼 내용", "확인된 흐름", "상담 전에 확인할 점", "자료와 한계"):
            self.assertIn(f"<h2>{section}</h2>", self.new_report)
        self.assertIn('href="../contact.html"', self.new_report)

    def test_area_terms_are_source_grounded_and_bounded(self):
        for phrase in ("주거전용면적", "주거공용면적", "계단", "복도", "관리사무소"):
            self.assertIn(phrase, self.new_report)
        self.assertIn("https://www.law.go.kr/", self.new_report)
        for overclaim in ("실사용면적과 같습니다", "가격을 보장", "매수 권유", "수익 보장"):
            self.assertNotIn(overclaim, self.new_report)

    def test_existing_url_keeps_publication_date_and_links_new_guide(self):
        self.assertIn('"datePublished":"2026-10-05"', self.existing_report)
        self.assertIn('"dateModified":"2026-10-13"', self.existing_report)
        self.assertIn(
            'href="2026-10-13-home-area-terms-guide.html"',
            self.existing_report,
        )

    def test_sitemap_and_public_copy_boundary(self):
        static_url = "https://lottes.co.kr/reports/2026-10-13-home-area-terms-guide.html"
        self.assertIn(f"<loc>{static_url}</loc>", self.sitemap)
        self.assertNotIn("report.html?slug=2026-10-13-home-area-terms-guide", self.sitemap)
        combined = self.new_report + self.existing_report
        for forbidden in ("SUPABASE_", "service_role", "API key", "프롬프트", "운영 기준", "MCP"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
