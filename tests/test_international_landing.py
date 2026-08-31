from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InternationalLandingTests(unittest.TestCase):
    def test_english_and_japanese_are_static_single_page_guides(self):
        pages = {
            'EN.html': {
                'lang': 'en',
                'scope': 'This page is a concise guide for international clients.',
                'translation': 'We use translation tools for written communication when needed.',
                'sensitive': 'Do not send ID documents, bank details, access codes, or full contracts in your first message.',
            },
            'JP.html': {
                'lang': 'ja',
                'scope': 'このページは海外のお客様向けの簡潔なご案内です。',
                'translation': '日本語でのお問い合わせには、翻訳ツールを利用して対応します。',
                'sensitive': '最初のお問い合わせでは、身分証明書、口座情報、出入口の暗証番号、契約書全文を送らないでください。',
            },
        }

        forbidden = (
            'listings-en.html',
            'listing-detail-en.html',
            'seoul-property-guide.html',
            'data-report-list',
            'data-feed-list',
            'listingsPage.en.js',
            'listingDetail.en.js',
            'homeReportPreview.js',
            '<form',
        )

        for filename, expected in pages.items():
            html = (ROOT / filename).read_text(encoding='utf-8')
            self.assertIn(f'<html lang="{expected["lang"]}">', html, filename)
            self.assertIn(expected['scope'], html, filename)
            self.assertIn(expected['translation'], html, filename)
            self.assertIn(expected['sensitive'], html, filename)
            self.assertIn('href="contact.html#inquiry-options"', html, filename)
            self.assertIn('href="tel:050714025055"', html, filename)
            self.assertIn('id="privacy"', html, filename)
            for marker in forbidden:
                self.assertNotIn(marker, html, f'{filename}: {marker}')

        japanese = (ROOT / 'JP.html').read_text(encoding='utf-8')
        for unsupported_claim in ('日本語スタッフ', '日本語対応スタッフ', 'ネイティブスタッフ'):
            self.assertNotIn(unsupported_claim, japanese)

    def test_legacy_english_urls_only_move_visitors_to_the_single_guide(self):
        legacy_pages = (
            'contact_EN.html',
            'listings-en.html',
            'listing-detail-en.html',
            'privacy_EN.html',
            'seoul-property-guide.html',
        )
        forbidden = (
            '<form',
            'listingsPage.en.js',
            'listingDetail.en.js',
            'data-report-list',
            'data-feed-list',
        )

        for filename in legacy_pages:
            html = (ROOT / filename).read_text(encoding='utf-8')
            self.assertIn('<meta name="robots" content="noindex,follow">', html, filename)
            self.assertIn('<link rel="canonical" href="https://lottes.co.kr/EN.html">', html, filename)
            self.assertIn('<meta http-equiv="refresh" content="0; url=EN.html">', html, filename)
            self.assertIn('href="EN.html"', html, filename)
            self.assertIn('js/privacyAnalytics.js', html, filename)
            for marker in forbidden:
                self.assertNotIn(marker, html, f'{filename}: {marker}')
    def test_language_discovery_only_indexes_two_international_guides(self):
        home = (ROOT / 'index.html').read_text(encoding='utf-8')
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')

        for html in (
            home,
            (ROOT / 'EN.html').read_text(encoding='utf-8'),
            (ROOT / 'JP.html').read_text(encoding='utf-8'),
        ):
            self.assertIn('hreflang="en" href="https://lottes.co.kr/EN.html"', html)
            self.assertIn('hreflang="ja" href="https://lottes.co.kr/JP.html"', html)
            self.assertIn('hreflang="ko-KR" href="https://lottes.co.kr/"', html)

        for filename in ('contact.html', 'listings.html', 'listing-detail.html'):
            html = (ROOT / filename).read_text(encoding='utf-8')
            self.assertIn('hreflang="en" href="https://lottes.co.kr/EN.html"', html, filename)
            self.assertIn('hreflang="ja" href="https://lottes.co.kr/JP.html"', html, filename)
            self.assertNotIn('hreflang="en" href="https://lottes.co.kr/contact_EN.html"', html, filename)
            self.assertNotIn('hreflang="en" href="https://lottes.co.kr/listings-en.html"', html, filename)
            self.assertNotIn('hreflang="en" href="https://lottes.co.kr/listing-detail-en.html"', html, filename)

        footer = home.split('<footer class="lr-footer">', 1)[1]
        self.assertIn('<a href="EN.html">ENGLISH</a>', footer)
        self.assertIn('<a href="JP.html">日本語</a>', footer)
        self.assertEqual(sitemap.count('<loc>https://lottes.co.kr/EN.html</loc>'), 1)
        self.assertEqual(sitemap.count('<loc>https://lottes.co.kr/JP.html</loc>'), 1)
        for legacy in (
            'contact_EN.html',
            'listings-en.html',
            'listing-detail-en.html',
            'privacy_EN.html',
            'seoul-property-guide.html',
        ):
            self.assertNotIn(legacy, sitemap)

    def test_language_suggestion_routes_only_to_single_international_guides(self):
        source = (ROOT / 'js/languageSuggestion.js').read_text(encoding='utf-8')
        self.assertIn("startsWith('ja')", source)
        self.assertIn("target: 'JP.html'", source)
        self.assertIn("target: 'EN.html'", source)
        self.assertIn('function cameFromInternationalGuide()', source)
        self.assertIn("new Set(['EN.html', 'JP.html'])", source)
        for legacy in ('contact_EN.html', 'listings-en.html', 'listing-detail-en.html', 'privacy_EN.html'):
            self.assertNotIn(legacy, source)

    def test_analytics_consent_has_japanese_copy_and_local_privacy_anchor(self):
        source = (ROOT / 'js/privacyAnalytics.js').read_text(encoding='utf-8')
        self.assertIn("startsWith('ja')", source)
        self.assertIn('JP.html#privacy', source)
        self.assertIn('アクセス解析', source)


if __name__ == '__main__':
    unittest.main()
