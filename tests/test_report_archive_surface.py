import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ReportArchiveAccessibilityTests(unittest.TestCase):
    def test_server_rendered_archive_links_every_static_report_once(self):
        page = (ROOT / "report.html").read_text(encoding="utf-8")
        start = page.index("<!-- STATIC_REPORT_ARCHIVE_START -->")
        end = page.index("<!-- STATIC_REPORT_ARCHIVE_END -->")
        archive = page[start:end]
        linked = re.findall(r'href="reports/([a-z0-9]+(?:-[a-z0-9]+)*)\.html"', archive)
        expected = {path.stem for path in (ROOT / "reports").glob("*.html")}

        self.assertEqual(len(linked), len(set(linked)))
        self.assertEqual(set(linked), expected)
        self.assertIn(f"전체 리포트 ({len(expected)}건)", archive)

    def test_archive_links_have_persistent_affordance_and_visible_keyboard_focus(self):
        css = (ROOT / "css" / "insights.css").read_text(encoding="utf-8")
        link_rule = re.search(r"\.lr-report-archive-all__list a\s*\{(?P<body>[^}]*)\}", css)
        self.assertIsNotNone(link_rule)
        assert link_rule is not None
        self.assertRegex(link_rule.group("body"), r"text-decoration:\s*underline")
        self.assertIn(".lr-report-archive-all__list a:focus-visible", css)
        self.assertRegex(
            css,
            r"\.lr-report-archive-all__list a:focus-visible\s*\{[^}]*outline:\s*3px solid",
        )


if __name__ == "__main__":
    unittest.main()
