import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class AnalyticsCoverageTest(unittest.TestCase):
    def test_every_public_html_page_loads_ga_and_journey_tracking(self):
        missing = []
        for path in sorted(REPO.glob('*.html')):
            text = path.read_text(encoding='utf-8', errors='ignore')
            if 'googletagmanager.com/gtag/js' not in text or 'js/analyticsEvents.js' not in text:
                missing.append(path.name)
        self.assertEqual(missing, [], f'analytics coverage missing: {missing}')


if __name__ == '__main__':
    unittest.main()
