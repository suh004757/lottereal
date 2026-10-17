import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
HOME = PUBLIC / "index.html"
CSS = PUBLIC / "css" / "home-journey.css"
JS = PUBLIC / "js" / "homeJourney.js"


class HomeJourneyMotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = HOME.read_text(encoding="utf-8")
        cls.css = CSS.read_text(encoding="utf-8")
        cls.js = JS.read_text(encoding="utf-8")

    def test_journey_keeps_five_readable_steps_in_html(self):
        section = self.home.split('id="services"', 1)[1].split("</section>", 1)[0]
        steps = re.findall(r"<button[^>]*data-journey-step[^>]*>(.*?)</button>", section, re.S)
        self.assertEqual(len(steps), 5)
        for title in ("상담 접수", "맞춤 제안", "현장 방문", "협상 · 계약", "입주 · 사후관리"):
            self.assertIn(f"<strong>{title}</strong>", section)
        self.assertEqual(section.count("data-journey-scene"), 5)
        self.assertIn('class="lr-journey__stage" aria-hidden="true"', section)

    def test_assets_are_self_hosted_and_csp_safe(self):
        self.assertIn('<link rel="stylesheet" href="css/home-journey.css">', self.home)
        self.assertIn('<script src="js/homeJourney.js"></script>', self.home)
        section = self.home.split('id="services"', 1)[1].split("</section>", 1)[0]
        self.assertNotRegex(section, r"\son[a-z]+=")
        self.assertNotIn("<script", section)
        self.assertNotIn("innerHTML", self.js)

    def test_motion_respects_user_preferences(self):
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.css)
        self.assertIn("prefers-reduced-motion: reduce", self.js)
        self.assertIn("IntersectionObserver", self.js)
        self.assertIn("visibilitychange", self.js)
        self.assertIn("data-journey-toggle", self.home)

    def test_mobile_layout_stacks_steps(self):
        mobile = self.css.split("@media (max-width: 768px)", 1)[1]
        self.assertIn("grid-template-columns: 1fr;", mobile)
        self.assertIn(".lr-journey__copy", mobile)


if __name__ == "__main__":
    unittest.main()
