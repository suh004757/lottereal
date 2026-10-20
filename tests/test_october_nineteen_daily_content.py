import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
NEW_ARTIFACT = ROOT / "content" / "daily" / "2026-10-19-songpa-youth-housing-finance-change.json"
EXISTING_ARTIFACT = ROOT / "content" / "daily" / "2026-10-19-existing-korea-real-estate-policy-report-update.json"
NEW_SLUG = "2026-10-19-songpa-youth-housing-finance-change"
EXISTING_SLUG = "2026-03-08-korea-real-estate-policy-report"


class OctoberNineteenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_ARTIFACT.read_text(encoding="utf-8"))
        cls.existing_report = json.loads(EXISTING_ARTIFACT.read_text(encoding="utf-8"))

    def test_new_article_is_source_grounded_and_public_safe(self):
        report = self.new_report
        self.assertEqual(report["slug"], NEW_SLUG)
        self.assertEqual(report["metadata"]["published_at"], "2026-10-19")
        self.assertEqual(report["metadata"]["original_published_at"], "2026-10-19")
        self.assertEqual(validate_report_copy(report), [])
        self.assertEqual(len(report["evidence_json"]), 5)
        self.assertTrue(all(source["checkedAt"] == "2026-10-19" for source in report["evidence_json"]))
        domains = {source["url"].split("/")[2] for source in report["evidence_json"]}
        self.assertEqual(domains, {"hf.go.kr", "www.hf.go.kr", "www.fsc.go.kr"})
        self.assertIn("10월 19일 신규", report["report_md"])
        self.assertIn("보증한도 3억원", report["report_md"])
        self.assertIn("한 명의 연소득이 7천만원 이하", report["report_md"])
        self.assertIn("실제 대출·보증 금액을 확정하지 않습니다", report["report_md"])
        self.assertIn("https://lottes.co.kr/contact.html", report["report_md"])
        self.assertIn(f"/reports/{EXISTING_SLUG}.html", report["report_md"])
        self.assertIn("2026년 10월 19일 확인 당시", report["report_md"])
        self.assertIn("만 34세 이하", report["report_md"])
        self.assertIn("최대 2억원", report["report_md"])
        self.assertIn("8천5백만원 이하", report["report_md"])
        self.assertIn("전산시스템 정비, 직원 교육, 고객 안내", report["report_md"])
        self.assertNotIn("심사와 안내를 함께 강조", report["report_md"])
        self.assertIn("현재 적용되는 서면 기준", report["report_md"])
        self.assertIn("계약금이나 매매계약", report["report_md"])
        source_urls = {source["url"] for source in report["evidence_json"]}
        self.assertIn("https://www.hf.go.kr/ko/sub02/sub02_01_01.do", source_urls)
        self.assertIn("https://www.hf.go.kr/ko/sub01/sub01_01_01.do", source_urls)
        combined = report["title"] + report["summary"] + report["report_md"]
        for phrase in ("투자 수익", "운영 기준", "API", "MCP", "프롬프트", "—"):
            self.assertNotIn(phrase, combined)

    def test_existing_url_keeps_identity_and_links_back(self):
        report = self.existing_report
        self.assertEqual(report["slug"], EXISTING_SLUG)
        self.assertEqual(report["metadata"]["published_at"], "2026-03-08")
        self.assertEqual(report["metadata"]["original_published_at"], "2026-03-08")
        self.assertEqual(report["metadata"]["modified_at"], "2026-10-19")
        self.assertEqual(validate_report_copy(report), [])
        self.assertIn(f"/reports/{NEW_SLUG}.html", report["report_md"])
        self.assertIn("청년·신혼가구 기준 변경", report["report_md"])
        self.assertNotIn("청년", report["title"])
        self.assertNotIn("특례전세보증", report["summary"])
        self.assertIn("간단히", report["report_md"])
        self.assertIn("2026년 10월 19일 확인 당시", report["report_md"])
        self.assertIn("현재 적용되는 서면 기준", report["report_md"])
        self.assertIn("계약금이나 매매계약", report["report_md"])
        self.assertIn("전산시스템 정비, 직원 교육, 고객 안내", report["report_md"])

    def test_articles_have_distinct_search_intent_and_deliberate_cross_links(self):
        detailed = self.new_report
        overview = self.existing_report
        self.assertIn("특례전세보증", detailed["title"])
        self.assertIn("상품별", detailed["summary"])
        self.assertIn("정책 큰 흐름", overview["title"])
        self.assertIn("대출 규제", overview["summary"])
        self.assertIn(f"/reports/{EXISTING_SLUG}.html", detailed["report_md"])
        self.assertIn(f"/reports/{NEW_SLUG}.html", overview["report_md"])
        self.assertIn("상품별 신청·확인 순서", overview["report_md"])

    def test_static_pages_and_sitemap_are_consistent(self):
        sitemap = (ROOT / "public" / "Sitemap.xml").read_text(encoding="utf-8")
        for slug, visible_text in (
            (NEW_SLUG, "청년 특례전세보증·신혼가구 보금자리론"),
            (EXISTING_SLUG, "2026년 10월 19일 청년·신혼가구 기준 변경"),
        ):
            report_html = (ROOT / "public" / "reports" / f"{slug}.html").read_text(encoding="utf-8")
            static_url = f"https://lottes.co.kr/reports/{slug}.html"
            self.assertIn(static_url, sitemap)
            self.assertIn(f'<link rel="canonical" href="{static_url}">', report_html)
            self.assertIn(visible_text, report_html)
        self.assertNotIn("report.html?slug=", sitemap)


if __name__ == "__main__":
    unittest.main()
