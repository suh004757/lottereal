from pathlib import Path
import unittest


REPO = Path(__file__).resolve().parents[1]


class SeoulPropertyGuideTest(unittest.TestCase):
    def setUp(self):
        self.html = (REPO / 'seoul-property-guide.html').read_text(encoding='utf-8')

    def test_guide_answers_high_intent_english_search_questions(self):
        for phrase in (
            'Buying an apartment in Seoul',
            'Renting with jeonse or monthly rent',
            'Office and retail searches',
            'Before you sign or pay',
        ):
            self.assertIn(phrase, self.html)

    def test_guide_uses_official_sources_and_scoped_language(self):
        self.assertIn('Official references checked August 30, 2026', self.html)
        self.assertIn('https://english.seoul.go.kr/global-real-estate-agency', self.html)
        self.assertIn('https://www.investkorea.org/ik-en/cntnts/i-418/web.do', self.html)
        self.assertIn('https://global.seoul.go.kr/web/news/sfaq/', self.html)
        self.assertIn('Rules and required documents can differ', self.html)
        self.assertNotIn('guaranteed', self.html.lower())

    def test_guide_has_clear_contact_and_internal_next_steps(self):
        self.assertIn('href="tel:050714025055">Call with your shortlist</a>', self.html)
        self.assertIn('href="contact_EN.html">Plan your visit</a>', self.html)
        self.assertIn('href="listings-en.html">Check current listings</a>', self.html)
        self.assertIn('js/analyticsEvents.js', self.html)


if __name__ == '__main__':
    unittest.main()
