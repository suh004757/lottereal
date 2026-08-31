from pathlib import Path
import unittest


REPO = Path(__file__).resolve().parents[1]


class AdminDashboardVisualConsistencyTest(unittest.TestCase):
    def test_properties_deep_link_is_activated(self):
        script = (REPO / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn('window.location.hash', script)
        self.assertIn("window.addEventListener('hashchange'", script)
        self.assertIn("activateSection('properties')", script)

    def test_advanced_dashboard_uses_family_board_visual_tokens(self):
        html = (REPO / 'admin' / 'dashboard.html').read_text(encoding='utf-8')
        css = (REPO / 'css' / 'admin-dashboard.css').read_text(encoding='utf-8')
        self.assertIn('Noto+Serif+KR', html)
        self.assertNotIn('family=Inter', html)
        self.assertIn('--admin-bg: #f4f1e9', css)
        self.assertIn('--admin-card: #fffdf8', css)
        self.assertIn('--admin-accent: #1f5b48', css)
        self.assertIn('"Noto Serif KR"', css)
        self.assertIn('min-height: 52px', css)


if __name__ == '__main__':
    unittest.main()