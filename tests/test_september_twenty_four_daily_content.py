import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_PATH = ROOT / "content/daily/2026-09-24-songpa-weekly-index-vs-apartment-price.json"
UPDATE_PATH = ROOT / "content/daily/2026-09-24-existing-real-trade-cancellation-update.json"


class SeptemberTwentyFourDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new = json.loads(NEW_PATH.read_text(encoding="utf-8"))
        cls.update = json.loads(UPDATE_PATH.read_text(encoding="utf-8"))

    def test_new_report_identity_sections_and_contact(self):
        report = self.new
        self.assertEqual(report["slug"], "2026-09-24-songpa-weekly-index-vs-apartment-price")
        self.assertEqual(report["status"], "published")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-24")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])

    def test_index_scope_is_honest(self):
        copy = self.new["report_md"]
        for phrase in (
            "약 0.12% 낮아졌습니다",
            "약 0.16% 높아졌습니다",
            "송파의 모든 아파트 가격이 0.12% 내렸다는 뜻은 아닙니다",
            "평당가나 억원 단위로 바꿔 읽을 수도 없습니다",
            "9월 24일에 새 시장 변화가 발표됐다는 뜻은 아닙니다",
        ):
            self.assertIn(phrase, copy)
        for forbidden in ("무조건", "확실히", "반드시 오릅니다", "—", "운영 기준", "API", "MCP"):
            self.assertNotIn(forbidden, copy)

    def test_sources_and_sitemap(self):
        urls = {item["url"] for item in self.new["evidence_json"]}
        self.assertTrue(any("reb.or.kr" in url for url in urls))
        self.assertTrue(any("rt.molit.go.kr" in url for url in urls))
        self.assertTrue(all(item.get("checkedAt") == "2026-09-24" for item in self.new["evidence_json"]))
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        for slug in (self.new["slug"], self.update["slug"]):
            start = sitemap.index("report.html?slug=" + slug)
            self.assertIn("<lastmod>2026-09-24</lastmod>", sitemap[start:start + 240])

    def test_existing_url_update_preserves_identity_and_adds_context(self):
        report = self.update
        self.assertEqual(report["slug"], "2026-09-06-songpa-apartment-real-trade-cancellation-check")
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-24")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn("최초 발행: 2026년 9월 6일", report["report_md"])
        self.assertIn(self.new["slug"], report["report_md"])
        self.assertIn("한국부동산원 부동산통계정보 R-ONE", report["report_md"])


if __name__ == "__main__":
    unittest.main()
