import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PAYLOAD = ROOT / "content/daily/2026-10-02-jamsil-office-business-registration-address.json"
SLUG = "2026-10-02-jamsil-office-business-registration-address"


class OctoberTwoDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], SLUG)
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-10-02")
        self.assertEqual(report["metadata"]["published_at"], "2026-10-02")
        self.assertEqual(validate_report_copy(report), [])
        for heading in ("먼저 볼 내용", "확인된 흐름", "상담 전에 확인할 점", "자료와 한계"):
            self.assertIn(f"## {heading}", report["report_md"])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_scope_is_practical_and_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "임대차계약서 사본",
            "표제부와 계약할 호수의 전유부",
            "관할 기관에 정확한 주소와 호수",
            "실제 허가 여부는 담당 기관의 심사와 현장 조건에 따라 달라집니다",
            "특정 주소의 사업자등록이나 영업 허가, 계약 결과를 보장하지 않습니다",
        ):
            self.assertIn(phrase, copy)
        for forbidden in ("무조건", "확실한 투자", "수익 보장", "—", "API", "MCP", "운영 기준"):
            self.assertNotIn(forbidden, copy)

    def test_official_sources_and_static_discovery(self):
        sources = self.report["evidence_json"]
        urls = {item["url"] for item in sources}
        self.assertEqual(len(urls), 2)
        self.assertTrue(any("nts.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(all(item.get("checkedAt") == "2026-10-02" for item in sources))
        sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn(f"https://lottes.co.kr/reports/{SLUG}.html", sitemap)
        html = (PUBLIC / "reports" / f"{SLUG}.html").read_text(encoding="utf-8")
        self.assertIn(f'<link rel="canonical" href="https://lottes.co.kr/reports/{SLUG}.html">', html)
        self.assertIn(self.report["title"], html)
        self.assertIn("잠실 사무실 관리비 확인법", html)


if __name__ == "__main__":
    unittest.main()
