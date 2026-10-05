import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
NEW_SLUG = "2026-10-05-samjeon-seokchon-villa-land-share-area"
UPDATED_SLUG = "2026-09-28-samjeon-seokchon-villa-price-reading"


class OctoberFiveDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_html = (PUBLIC / "reports" / f"{NEW_SLUG}.html").read_text(encoding="utf-8")
        cls.updated_html = (PUBLIC / "reports" / f"{UPDATED_SLUG}.html").read_text(encoding="utf-8")
        cls.sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")

    def test_new_report_is_discoverable_and_self_canonical(self):
        self.assertIn(f"https://lottes.co.kr/reports/{NEW_SLUG}.html", self.sitemap)
        self.assertIn(
            f'<link rel="canonical" href="https://lottes.co.kr/reports/{NEW_SLUG}.html">',
            self.new_html,
        )
        self.assertIn("2026년 10월 5일 삼전·석촌 빌라, 대지권면적은 왜 같이 봐야 하나요?", self.new_html)

    def test_new_report_has_practical_scope_sources_and_disclaimer(self):
        for phrase in (
            "대지권면적",
            "집합건축물대장 표제부·전유부",
            "필지 전체 면적과 한 호수에 표시된 대지권면적",
            "특정 주택의 권리나 적정가를 보증하거나 매수·매도를 권유하지 않습니다",
            "data.seoul.go.kr",
            "CappBizCD=15000000098",
            "CappBizCD=13100000026",
            "../contact.html",
        ):
            self.assertIn(phrase, self.new_html)
        for forbidden in ("확실한 투자", "수익 보장", "API", "MCP", "운영 기준"):
            self.assertNotIn(forbidden, self.new_html)

    def test_existing_report_preserves_publication_date_and_links_forward(self):
        self.assertIn('"datePublished":"2026-09-28"', self.updated_html)
        self.assertIn('"dateModified":"2026-10-05"', self.updated_html)
        self.assertIn("발행 2026-09-28 · 수정 2026-10-05", self.updated_html)
        self.assertIn(f'href="{NEW_SLUG}.html"', self.updated_html)


if __name__ == "__main__":
    unittest.main()
