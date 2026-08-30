from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class ZigbangInquiryRedirectSurfaceTest(unittest.TestCase):
    def test_redirect_surface_is_noindex_noanalytics_and_fragment_only(self):
        html = (ROOT / 'redirect' / 'zigbang-inquiry.html').read_text(encoding='utf-8')
        script = (ROOT / 'js' / 'zigbangInquiryRedirect.mjs').read_text(encoding='utf-8')
        self.assertIn('noindex,nofollow,noarchive', html)
        self.assertIn('no-referrer', html)
        self.assertIn("default-src 'none'; script-src 'self'", html)
        self.assertIn('js/zigbangInquiryRedirect.mjs', html)
        self.assertNotIn('analytics', html.lower())
        self.assertNotIn('supabase', html.lower())
        self.assertIn('window.location.hash', script)
        self.assertIn('window.history.replaceState', script)
        self.assertIn('window.location.replace', script)
        self.assertNotIn('localStorage', script)
        self.assertNotIn('sessionStorage', script)
        self.assertNotIn('console.', script)
        self.assertNotIn('fetch(', script)


if __name__ == '__main__':
    unittest.main()
