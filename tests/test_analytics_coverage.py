import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class AnalyticsCoverageTest(unittest.TestCase):
    def test_every_public_html_page_loads_ga_journey_and_naver_tracking(self):
        missing = []
        for path in sorted(REPO.glob('*.html')):
            text = path.read_text(encoding='utf-8', errors='ignore')
            required = (
                'googletagmanager.com/gtag/js',
                'js/analyticsEvents.js',
                'wcs.pstatic.net/wcslog.js',
                'wcs_add["wa"] = "1a98a7eafcb1eb0"',
                'wcs_do();',
            )
            if any(marker not in text for marker in required):
                missing.append(path.name)
        self.assertEqual(missing, [], f'analytics coverage missing: {missing}')


if __name__ == '__main__':
    unittest.main()
