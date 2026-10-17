import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


class ReportGlanceTests(unittest.TestCase):
    def test_every_static_report_has_glance_strip_and_progress_bar(self):
        pages = list((PUBLIC / "reports").glob("*.html"))
        self.assertTrue(pages)
        for page in pages:
            html = page.read_text(encoding="utf-8")
            self.assertIn('<div class="lr-read-progress" aria-hidden="true"><span></span></div>', html, page.name)
            strip = re.search(r'<ul class="lr-report-glance" aria-label="한눈에 보기">(.*?)</ul>', html)
            self.assertIsNotNone(strip, page.name)
            self.assertRegex(strip.group(1), r"약 \d+분")
            self.assertRegex(strip.group(1), r"공개 출처</span><strong>\d+건")

    def test_report_body_text_is_not_thin_and_progress_respects_reduced_motion(self):
        css = (PUBLIC / "css" / "insights.css").read_text(encoding="utf-8")
        tail = css[css.index("/* Static report readability"):]
        self.assertIn("font-weight: 400;", tail)
        self.assertIn("animation-timeline: scroll(root);", tail)
        self.assertIn("@media (prefers-reduced-motion: reduce)", tail)

    def test_dark_header_buttons_do_not_leak_into_archive_intent_panel(self):
        css = (PUBLIC / "css" / "insights.css").read_text(encoding="utf-8")
        self.assertNotIn(".lr-report-header .lr-report-intent-actions", css)
        self.assertIn(".lr-report-header > .lr-container > .lr-report-intent-actions .lr-btn--ghost", css)


if __name__ == "__main__":
    unittest.main()
