import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
HOME = PUBLIC / "index.html"
CSS = PUBLIC / "css" / "home-motion.css"
REPORT_PREVIEW = PUBLIC / "js" / "homeReportPreview.js"


class HomeMotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = HOME.read_text(encoding="utf-8")
        cls.css = CSS.read_text(encoding="utf-8")
        cls.preview = REPORT_PREVIEW.read_text(encoding="utf-8")

    def test_hero_skyline_is_decorative_and_keeps_hero_copy(self):
        hero = self.home.split('id="hero"', 1)[1].split("</section>", 1)[0]
        self.assertIn('class="lr-hero lr-hero--night"', self.home)
        self.assertRegex(hero, r'<svg class="lr-hero-skyline"[^>]*aria-hidden="true"')
        self.assertIn("전화로 바로 상담", hero)
        self.assertIn('href="tel:050714025055"', hero)
        self.assertNotIn('class="particle"', hero)
        self.assertNotRegex(hero, r"\son[a-z]+=")

    def test_hero_skyline_is_a_quiet_line_drawing(self):
        hero = self.home.split('id="hero"', 1)[1].split("</section>", 1)[0]
        self.assertIn('class="lh-line lh-line--tower"', hero)
        for busy in ("lh-star", "lh-win", "lh-ripple", "lr-kicker"):
            self.assertNotIn(busy, hero)
        self.assertIn("</span> <span>", hero)
        self.assertNotIn("background-clip: text", self.css)

    def test_motion_stylesheet_is_loaded_and_respects_reduced_motion(self):
        self.assertIn('<link rel="stylesheet" href="css/home-motion.css">', self.home)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.css)
        self.assertIn("@supports (animation-timeline: view())", self.css)

    def test_report_covers_are_static_decorative_markup(self):
        covers = re.findall(r"const (MARKET|DISPUTE)_COVER = `(.*?)`;", self.preview, re.S)
        self.assertEqual({name for name, _ in covers}, {"MARKET", "DISPUTE"})
        for _, markup in covers:
            self.assertIn('aria-hidden="true"', markup)
            self.assertNotIn("${", markup)
        self.assertIn("${renderCover(report)}", self.preview)

    def test_weekly_chart_states_source_date_and_disclaimer(self):
        stats = self.home.split('id="official-stats"', 1)[1].split("</section>", 1)[0]
        self.assertEqual(stats.count('class="lr-weekly__row '), 6)
        self.assertRegex(stats, r"\d{4}-\d{2}-\d{2} 기준")
        self.assertIn("한국부동산원", stats)
        self.assertIn("매수·매도 권유가 아닙니다", stats)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.css)


class ReportShareCardTests(unittest.TestCase):
    def test_exporter_maps_report_types_to_existing_share_cards(self):
        exporter = (ROOT / "scripts" / "export_static_reports.mjs").read_text(encoding="utf-8")
        self.assertIn("return `report-${reportCategory(report).key}.png`;", exporter)
        for name in ("market", "checklist", "guide", "dispute"):
            self.assertIn(f"key: '{name}'", exporter)
            self.assertTrue((PUBLIC / "img" / "og" / f"report-{name}.png").is_file())
        for page in (PUBLIC / "reports").glob("*.html"):
            html = page.read_text(encoding="utf-8")
            self.assertRegex(html, r'og:image" content="https://lottes\.co\.kr/img/og/report-(market|checklist|guide|dispute)\.png"')


if __name__ == "__main__":
    unittest.main()
