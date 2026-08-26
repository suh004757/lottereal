import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class AnalyticsCoverageTest(unittest.TestCase):
    def test_every_public_html_page_uses_the_privacy_analytics_loader(self):
        missing = []
        direct_tracking = []
        for path in sorted(REPO.glob('*.html')):
            text = path.read_text(encoding='utf-8', errors='ignore')
            if path.name.startswith('naver') and text.startswith('naver-site-verification:'):
                continue
            if 'js/privacyAnalytics.js' not in text:
                missing.append(path.name)
            if 'googletagmanager.com/gtag/js' in text or 'wcs.pstatic.net/wcslog.js' in text:
                direct_tracking.append(path.name)
        self.assertEqual(missing, [], f'analytics coverage missing: {missing}')
        self.assertEqual(direct_tracking, [], f'direct tracking bypasses privacy control: {direct_tracking}')

    def test_single_analytics_provider_is_privacy_minimized(self):
        loader = (REPO / 'js/privacyAnalytics.js').read_text(encoding='utf-8')
        self.assertIn('googletagmanager.com/gtag/js', loader)
        self.assertNotIn('wcs.pstatic.net', loader)
        self.assertIn('allow_google_signals: false', loader)
        self.assertIn('allow_ad_personalization_signals: false', loader)


if __name__ == '__main__':
    unittest.main()
