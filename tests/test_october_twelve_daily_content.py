import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "public/reports/2026-10-12-songpa-home-sale-transaction-reporting.html"
SITEMAP_PATH = ROOT / "public/Sitemap.xml"


class OctoberTwelveDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = REPORT_PATH.read_text(encoding="utf-8")
        cls.sitemap = SITEMAP_PATH.read_text(encoding="utf-8")

    def test_static_report_has_identity_and_reader_sections(self):
        report = self.report
        self.assertIn("<h1>2026년 10월 12일 송파 주택 매매, 실거래 신고는 누가 언제 하나요?</h1>", report)
        self.assertIn(
            '<link rel="canonical" href="https://lottes.co.kr/reports/2026-10-12-songpa-home-sale-transaction-reporting.html">',
            report,
        )
        for section in ("먼저 볼 내용", "확인된 흐름", "상담 전에 확인할 점", "자료와 한계"):
            self.assertIn(f"<h2>{section}</h2>", report)
        self.assertIn('href="../contact.html"', report)

    def test_primary_sources_and_bounded_claims(self):
        report = self.report
        self.assertGreaterEqual(report.count("https://www.law.go.kr/"), 2)
        for phrase in ("계약 체결일부터", "30일", "개업공인중개사", "거래당사자가 공동으로 신고"):
            self.assertIn(phrase, report)
        for overclaim in ("자동으로 신고", "무조건 안전", "수익 보장", "매수 권유"):
            self.assertNotIn(overclaim, report)

    def test_sitemap_uses_static_report_url(self):
        expected = "https://lottes.co.kr/reports/2026-10-12-songpa-home-sale-transaction-reporting.html"
        self.assertIn(f"<loc>{expected}</loc>", self.sitemap)
        self.assertNotIn("report.html?slug=2026-10-12-songpa-home-sale-transaction-reporting", self.sitemap)

    def test_no_private_or_internal_operating_copy(self):
        for forbidden in ("SUPABASE_", "service_role", "API key", "프롬프트", "운영 기준", "MCP"):
            self.assertNotIn(forbidden, self.report)


if __name__ == "__main__":
    unittest.main()
