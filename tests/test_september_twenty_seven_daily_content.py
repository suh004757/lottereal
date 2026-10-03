import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
NEW_REPORT_PATH = ROOT / "content/daily/2026-09-27-jamsil-office-management-fee-details.json"
UPDATE_PATH = ROOT / "content/daily/2026-09-27-existing-jamsil-office-management-fee-update.json"
NEW_SLUG = "2026-09-27-jamsil-office-management-fee-details"
EXISTING_SLUG = "2026-03-08-jamsil-office-market-report"


class SeptemberTwentySevenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_REPORT_PATH.read_text(encoding="utf-8"))
        cls.existing_update = json.loads(UPDATE_PATH.read_text(encoding="utf-8"))

    def test_new_report_identity_sections_and_contact(self):
        report = self.new_report
        self.assertEqual(report["slug"], NEW_SLUG)
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-27")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_management_fee_rules_are_scoped_and_practical(self):
        copy = self.new_report["report_md"]
        for phrase in (
            "법 적용 대상 임대차",
            "월 관리비가 10만원 미만",
            "14개 항목",
            "보증금에 월세의 100배를 더한 환산보증금",
            "시행령상 서울 기준은 9억원",
            "관리비 금액을 정해 주거나 모든 비용을 자동으로 돌려준다는 뜻은 아닙니다",
        ):
            self.assertIn(phrase, copy)
        for forbidden in ("보장합니다", "무조건", "확실한 투자", "—", "API", "MCP"):
            self.assertNotIn(forbidden, copy)

    def test_official_sources_and_static_discovery(self):
        urls = {item["url"] for item in self.new_report["evidence_json"]}
        self.assertEqual(len(urls), 3)
        self.assertTrue(any("law.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(all(item.get("checkedAt") == "2026-09-27" for item in self.new_report["evidence_json"]))
        sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn(f"https://lottes.co.kr/reports/{NEW_SLUG}.html", sitemap)
        html = (PUBLIC / "reports" / f"{NEW_SLUG}.html").read_text(encoding="utf-8")
        self.assertIn(f'<link rel="canonical" href="https://lottes.co.kr/reports/{NEW_SLUG}.html">', html)
        self.assertIn(self.new_report["title"], html)

    def test_existing_url_keeps_identity_and_links_to_new_guide(self):
        report = self.existing_update
        self.assertEqual(report["slug"], EXISTING_SLUG)
        self.assertEqual(report["title"], "2026년 3월 잠실 사무실 시장: 임대 조건과 개발 일정 확인법")
        self.assertIn("최초 자료 기준일: 2026년 3월 8일", report["report_md"])
        self.assertIn("수정·자료 확인: 2026년 9월 27일", report["report_md"])
        self.assertIn(f"https://lottes.co.kr/reports/{NEW_SLUG}.html", report["report_md"])
        self.assertEqual(validate_report_copy(report), [])


if __name__ == "__main__":
    unittest.main()
