from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


class InternationalLandingTests(unittest.TestCase):
    def test_english_guide_explains_proportionate_remote_inquiry_verification(self):
        html = (PUBLIC / 'EN.html').read_text(encoding='utf-8')

        for marker in (
            'Remote inquiry verification',
            'institutional email address issued by your school or employer',
            'confirm that you control the phone number or messaging account',
            'prevent impersonation',
            'Do not send identity documents in your first inquiry',
        ):
            self.assertIn(marker, html)

    def test_english_guide_explains_rental_types_and_foreign_resident_protection_steps(self):
        html = (PUBLIC / 'EN.html').read_text(encoding='utf-8')

        for marker in (
            'Renting in Korea: a quick guide',
            'Wolse (monthly rent)',
            'Jeonse (large refundable deposit)',
            'Banjeonse (higher deposit, lower monthly rent)',
            'Foreign resident address reporting and deposit protection',
            'taking possession of the home',
            'fixed date',
            'within 15 days of moving',
            'Requirements can differ by immigration status',
            'exact move-out date and whether early termination is allowed',
            'landlord’s identity, ownership or authority to lease',
            'before paying a deposit',
            'rental-contract reporting or a fixed-date procedure',
            'may vary depending on the property, lease terms, visa status and local rules',
            'A six-month term alone does not determine whether the Housing Lease Protection Act applies',
            'clearly for temporary use may fall outside the Act',
        ):
            self.assertIn(marker, html)

        self.assertIn('https://www.law.go.kr/법령/출입국관리법/제36조', html)
        self.assertIn('https://www.law.go.kr/법령/출입국관리법/제88조의2', html)
        self.assertIn('https://www.law.go.kr/법령/주택임대차보호법/제3조의2', html)
        self.assertIn('https://www.law.go.kr/법령/주택임대차보호법/제11조', html)
        self.assertNotIn('guarantees the return of your deposit', html.lower())
        self.assertNotIn('lease registration', html.lower())

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
            html = (PUBLIC / filename).read_text(encoding='utf-8')
            self.assertIn(f'<html lang="{expected["lang"]}">', html, filename)
            self.assertIn(expected['scope'], html, filename)
            self.assertIn(expected['translation'], html, filename)
            self.assertIn(expected['sensitive'], html, filename)
            self.assertIn('href="contact.html#inquiry-options"', html, filename)
            self.assertIn('href="tel:050714025055"', html, filename)
            self.assertIn('id="privacy"', html, filename)
            for marker in forbidden:
                self.assertNotIn(marker, html, f'{filename}: {marker}')

        japanese = (PUBLIC / 'JP.html').read_text(encoding='utf-8')
        for unsupported_claim in ('日本語スタッフ', '日本語対応スタッフ', 'ネイティブスタッフ'):
            self.assertNotIn(unsupported_claim, japanese)

    def test_english_guide_exposes_the_migrated_safety_and_inquiry_entry_points(self):
        html = (PUBLIC / 'EN.html').read_text(encoding='utf-8')
        css = (PUBLIC / 'css' / 'international.css').read_text(encoding='utf-8')
        self.assertIn('Rental Safety Guide for International Residents', html)
        self.assertIn('Open the rental safety guide', html)
        self.assertIn('English guided inquiry', html)
        self.assertIn('A Korean callback number is currently required', html)
        self.assertGreaterEqual(html.count('data-open-guided-inquiry'), 3)
        self.assertGreaterEqual(html.count('aria-haspopup="dialog"'), 5)
        self.assertIn('external listing reference and any current-site listing context', html)
        mobile_bar = html.split('<div class="lr-mobile-actionbar intl-mobile-actionbar"', 1)[1].split('</div>', 1)[0]
        self.assertEqual(mobile_bar.count('<a '), 2)
        self.assertIn('>CONTACT</a>', mobile_bar)
        self.assertIn('>RENTAL GUIDE</a>', mobile_bar)
        self.assertNotIn('<span', mobile_bar)
        self.assertIn('.intl-page .intl-mobile-actionbar', css)
        self.assertIn('font-weight: 700;', css)
        self.assertIn('js/knowledgeWidget.js', html)
        self.assertIn('aria-label="Quick contact menu"', html)

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
            html = (PUBLIC / filename).read_text(encoding='utf-8')
            self.assertIn('<meta name="robots" content="noindex,follow">', html, filename)
            self.assertIn('<link rel="canonical" href="https://lottes.co.kr/EN.html">', html, filename)
            self.assertIn('<meta http-equiv="refresh" content="0; url=EN.html">', html, filename)
            self.assertIn('href="EN.html"', html, filename)
            self.assertIn('js/privacyAnalytics.js', html, filename)
            for marker in forbidden:
                self.assertNotIn(marker, html, f'{filename}: {marker}')
    def test_language_discovery_only_indexes_two_international_guides(self):
        home = (PUBLIC / 'index.html').read_text(encoding='utf-8')
        sitemap = (PUBLIC / 'Sitemap.xml').read_text(encoding='utf-8')

        for html in (
            home,
            (PUBLIC / 'EN.html').read_text(encoding='utf-8'),
            (PUBLIC / 'JP.html').read_text(encoding='utf-8'),
        ):
            self.assertIn('hreflang="en" href="https://lottes.co.kr/EN.html"', html)
            self.assertIn('hreflang="ja" href="https://lottes.co.kr/JP.html"', html)
            self.assertIn('hreflang="ko-KR" href="https://lottes.co.kr/"', html)

        for filename in ('contact.html', 'listings.html', 'listing-detail.html'):
            html = (PUBLIC / filename).read_text(encoding='utf-8')
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
        source = (PUBLIC / 'js/languageSuggestion.js').read_text(encoding='utf-8')
        self.assertIn("startsWith('ja')", source)
        self.assertIn("target: 'JP.html'", source)
        self.assertIn("target: 'EN.html'", source)
        self.assertIn('function cameFromInternationalGuide()', source)
        self.assertIn("new Set(['EN.html', 'JP.html'])", source)
        for legacy in ('contact_EN.html', 'listings-en.html', 'listing-detail-en.html', 'privacy_EN.html'):
            self.assertNotIn(legacy, source)

    def test_analytics_consent_has_japanese_copy_and_local_privacy_anchor(self):
        source = (PUBLIC / 'js/privacyAnalytics.js').read_text(encoding='utf-8')
        self.assertIn("startsWith('ja')", source)
        self.assertIn('JP.html#privacy', source)
        self.assertIn('アクセス解析', source)


if __name__ == '__main__':
    unittest.main()
