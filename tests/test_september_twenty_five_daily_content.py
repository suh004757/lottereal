import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "content/daily/2026-09-25-electronic-lease-contract-auto-filing-check.json"


class SeptemberTwentyFiveDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))

    def test_identity_sections_and_contact(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-25-electronic-lease-contract-auto-filing-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-25")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_automatic_application_scope_is_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "실거래가·확정일자·임대차 신고가 자동 신청됩니다",
            "'자동 신청'과 '처리 완료 확인'은 같은 말이 아닙니다",
            "임대차 신고 이력과 신고필증",
            "계약 변경·해제 여부",
        ):
            self.assertIn(phrase, copy)
        for forbidden in ("자동 완료", "무조건", "확실히", "—", "운영 기준", "API", "MCP"):
            self.assertNotIn(forbidden, copy)

    def test_sources_and_sitemap(self):
        urls = {item["url"] for item in self.report["evidence_json"]}
        self.assertTrue(any("irts.molit.go.kr" in url for url in urls))
        self.assertTrue(any("gov.kr" in url for url in urls))
        self.assertTrue(all(item.get("checkedAt") == "2026-09-25" for item in self.report["evidence_json"]))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        start = sitemap.index("reports/" + self.report["slug"] + ".html")
        self.assertRegex(sitemap[start:start + 240], r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")


if __name__ == "__main__":
    unittest.main()
