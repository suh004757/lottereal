import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "songpa-neighborhood-guide.html"
CONFIG = ROOT / "Data" / "songpa-neighborhood-guide.v1.json"


class SongpaNeighborhoodGuideSurfaceTests(unittest.TestCase):
    def test_page_has_local_private_matcher_and_search_metadata(self):
        page = PAGE.read_text(encoding="utf-8")
        self.assertIn("<title>송파 동네 선택 도우미", page)
        self.assertIn('rel="canonical" href="https://lottes.co.kr/songpa-neighborhood-guide.html"', page)
        self.assertIn('id="neighborhood-helper-form"', page)
        self.assertIn('name="purpose"', page)
        self.assertIn('name="priority"', page)
        self.assertIn("1~3개 선택", page)
        self.assertIn('id="neighborhood-helper-result"', page)
        self.assertIn('aria-live="polite"', page)
        self.assertIn('src="js/songpaNeighborhoodPage.mjs"', page)
        self.assertNotIn("<form action=", page)
        self.assertIn("점수를 앞세우지 않고", page)
        self.assertNotIn("점수를 감추지 않고", page)
        self.assertIn("입력한 선택은 저장하거나 전송하지 않습니다", page)

    def test_strict_csp_page_has_no_inline_script_blocks(self):
        page = PAGE.read_text(encoding="utf-8")
        script_open_tags = re.findall(r"<script\b[^>]*>", page, flags=re.IGNORECASE)
        self.assertGreaterEqual(len(script_open_tags), 3)
        self.assertTrue(all(" src=" in tag for tag in script_open_tags))
        self.assertNotIn('type="application/ld+json"', page)

    def test_page_states_scope_limits_sources_and_conversion_paths(self):
        page = PAGE.read_text(encoding="utf-8")
        for phrase in (
            "잠실동",
            "삼전동",
            "석촌동",
            "송파동",
            "방이동",
            "가락동",
            "문정동",
            "가격 순위가 아닙니다",
            "현장과 최신 공적자료를 다시 확인",
            "2026년 10월 1일",
            "송파구청",
            "서울교통공사",
        ):
            self.assertIn(phrase, page)
        self.assertIn('href="listings.html"', page)
        self.assertIn('href="contact.html"', page)

    def test_config_is_versioned_sourced_and_contains_seven_non_price_profiles(self):
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["schemaVersion"], 1)
        self.assertEqual(config["checkedAt"], "2026-10-01")
        self.assertEqual(config["resultLimit"], 2)
        self.assertEqual(len(config["neighborhoods"]), 7)
        self.assertEqual(
            {item["id"] for item in config["neighborhoods"]},
            {"jamsil", "samjeon", "seokchon", "songpa", "bangi", "garak", "munjeong"},
        )
        self.assertGreaterEqual(len(config["sources"]), 3)
        self.assertTrue(all(source["url"].startswith("https://") for source in config["sources"]))
        serialized = json.dumps(config, ensure_ascii=False).lower()
        for forbidden in ("saleprice", "rentprice", "averageprice", "phone", "email"):
            self.assertNotIn(forbidden, serialized)

    def test_page_exposes_keyboard_and_live_region_accessibility(self):
        page = PAGE.read_text(encoding="utf-8")
        css = (ROOT / "css" / "songpa-neighborhood-guide.css").read_text(encoding="utf-8")
        self.assertGreaterEqual(page.count("<fieldset"), 2)
        self.assertGreaterEqual(page.count("<legend"), 2)
        self.assertIn('id="neighborhood-helper-error" class="nh-form__error" role="alert" tabindex="-1"', page)
        self.assertIn('id="neighborhood-helper-result" class="nh-result" tabindex="-1" aria-live="polite"', page)
        self.assertIn("min-height: 48px", css)
        self.assertIn("@media (prefers-reduced-motion: reduce)", css)
        self.assertIn("input:focus-visible + span", css)
        runtime = (ROOT / "js" / "songpaNeighborhoodPage.mjs").read_text(encoding="utf-8")
        self.assertIn("matchMedia?.('(prefers-reduced-motion: reduce)').matches", runtime)
        self.assertIn("reduceMotion ? 'auto' : 'smooth'", runtime)

    def test_runtime_keeps_answers_local_and_analytics_aggregate(self):
        script = (ROOT / "js" / "songpaNeighborhoodPage.mjs").read_text(encoding="utf-8")
        self.assertIn("fetch(CONFIG_URL", script)
        self.assertEqual(script.count("fetch("), 1)
        for forbidden in ("localStorage", "sessionStorage", "URLSearchParams", "formData"):
            self.assertNotIn(forbidden, script)
        self.assertIn("{ result_count: matches.length }", script)
        self.assertNotIn("purpose, priorities", script[script.index("function track"):script.index("async function loadConfig")])

    def test_page_is_discoverable_without_crowding_primary_navigation(self):
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        knowledge = (ROOT / "knowledge.html").read_text(encoding="utf-8")
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn('href="songpa-neighborhood-guide.html"', index)
        self.assertIn('href="songpa-neighborhood-guide.html"', knowledge)
        self.assertIn("https://lottes.co.kr/songpa-neighborhood-guide.html", sitemap)
        nav_start = index.index('<nav class="lr-nav"')
        nav_end = index.index('</nav>', nav_start)
        self.assertNotIn('songpa-neighborhood-guide.html', index[nav_start:nav_end])


if __name__ == "__main__":
    unittest.main()
