import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-09-20-songpa-lost-lease-contract-fixed-date-check.json"


class SeptemberTwentyDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_daily_identity_sections_and_contact_path(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-09-20-songpa-lost-lease-contract-fixed-date-check")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-20")
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report["report_md"]), 700)
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_recovery_scope_is_specific_and_honest(self):
        copy = self.report["report_md"]
        for phrase in (
            "확정일자부를 열람",
            "확정일자가 부여된 계약증서 발급 서비스",
            "공인전자문서센터에 보관",
            "모든 문제가 끝나는 것은 아닙니다",
            "임의로 고치거나 다시 서명하기 전에",
        ):
            self.assertIn(phrase, copy)
        self.assertNotIn("계약서를 잃어버려도 아무 문제", copy)
        self.assertNotIn("보증금이 자동으로 보호", copy)

    def test_sources_and_sitemap(self):
        urls = {source["url"] for source in self.report["evidence_json"]}
        self.assertTrue(any("easylaw.go.kr" in url for url in urls))
        self.assertTrue(any("iros.go.kr" in url for url in urls))
        self.assertTrue(any("irts.molit.go.kr" in url for url in urls))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        entry = "reports/" + self.report["slug"] + ".html"
        start = sitemap.index(entry)
        self.assertRegex(sitemap[start:start + 240], r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>")

    def test_public_copy_quality(self):
        copy = self.report["report_md"]
        for forbidden in ("운영 기준", "예측 검색어", "프롬프트", "API 키", "MCP", "—", "Executive Summary"):
            self.assertNotIn(forbidden, copy)


if __name__ == "__main__":
    unittest.main()
