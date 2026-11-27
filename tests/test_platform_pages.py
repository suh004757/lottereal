from pathlib import Path
import re
import unittest

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
PAGES = {'index.html', 'listing.html', 'request.html', 'login.html', 'me.html'}
CSP = re.compile(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">')

class PlatformPagesTest(unittest.TestCase):
    def test_candidate_pages_have_noindex_csp_and_disclosures(self):
        files = {p.name:p for p in (PUBLIC / 'jamsilsari').glob('*.html')}
        self.assertTrue(PAGES.issubset(files), PAGES - files.keys())
        existing = CSP.search((PUBLIC / 'index.html').read_text()).group(1)
        for name, path in files.items():
            with self.subTest(name=name):
                text = path.read_text()
                self.assertIn('<meta name="robots" content="noindex,nofollow">', text)
                self.assertEqual(CSP.search(text).group(1), existing)
                for field in ('롯데공인중개사사무소', '11710-2018-00141', '서봉현', '백제고분로27길 27', '0507-1402-5055'):
                    self.assertIn(field, text)
                self.assertNotIn('보증', text.replace('보증금', ''))

    def test_no_default_activation(self):
        js = PUBLIC / 'jamsilsari/js'
        for name in ('ENABLE_SIGN_IN', 'ENABLE_REQUESTS'):
            self.assertIn(f'const {name} = false', (js / 'config.mjs').read_text())

if __name__ == '__main__':
    unittest.main()
