import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def public_html_files():
    for path in ROOT.glob('*.html'):
        text = path.read_text(encoding='utf-8', errors='ignore')
        if '<html' in text.lower():
            yield path, text


class PrivacyFrontendTests(unittest.TestCase):
    def test_public_pages_use_central_privacy_analytics_loader(self):
        pages = list(public_html_files())
        self.assertTrue(pages)
        for path, text in pages:
            self.assertNotIn('googletagmanager.com/gtag/js', text, path.name)
            self.assertNotIn('wcs.pstatic.net/wcslog.js', text, path.name)
            self.assertIn('js/privacyAnalytics.js', text, path.name)

    def test_analytics_loader_minimizes_tracking_and_respects_control(self):
        path = ROOT / 'js/privacyAnalytics.js'
        self.assertTrue(path.exists())
        text = path.read_text(encoding='utf-8')
        self.assertIn('lr_analytics_choice', text)
        self.assertIn('doNotTrack', text)
        self.assertIn('allow_google_signals: false', text)
        self.assertIn('allow_ad_personalization_signals: false', text)
        self.assertIn('cookie_expires: 7776000', text)
        self.assertIn('window.location.origin + window.location.pathname', text)
        self.assertIn('function sanitizedReferrer()', text)
        self.assertIn('page_referrer: sanitizedReferrer()', text)
        self.assertIn('privacy.html', text)
        self.assertIn('privacy_EN.html', text)
        self.assertIn('LotteRealPrivacy', text)
        self.assertIn('function analyticsPreferenceEnabled()', text)
        self.assertIn('const enabled = analyticsPreferenceEnabled();', text)
        self.assertIn("const ANALYTICS_ALLOWED = 'allowed'", text)
        self.assertIn("const ANALYTICS_REQUIRED_ONLY = 'required-only'", text)
        self.assertIn('function showAnalyticsNotice()', text)
        self.assertIn('data-analytics-notice', text)

    def test_custom_analytics_never_send_full_url_or_phone_link(self):
        text = (ROOT / 'js/analyticsEvents.js').read_text(encoding='utf-8')
        self.assertNotIn('window.location.href', text)
        self.assertNotIn('link_url: href', text)
        self.assertNotIn('target.search', text)

    def test_international_guides_do_not_collect_inquiries_directly(self):
        for filename in ('EN.html', 'JP.html'):
            html = (ROOT / filename).read_text(encoding='utf-8')
            self.assertNotIn('<form', html, filename)
            self.assertIn('href="contact.html#inquiry-options"', html, filename)
            self.assertIn('data-analytics-disable', html, filename)
            self.assertIn('data-analytics-enable', html, filename)
        english = (ROOT / 'EN.html').read_text(encoding='utf-8')
        japanese = (ROOT / 'JP.html').read_text(encoding='utf-8')
        self.assertIn('Do not send ID documents, bank details', english)
        self.assertIn('身分証明書、口座情報', japanese)

    def test_admin_pages_do_not_load_public_analytics(self):
        for path in (ROOT / 'admin').glob('*.html'):
            text = path.read_text(encoding='utf-8', errors='ignore')
            self.assertNotIn('googletagmanager.com', text, path.name)
            self.assertNotIn('privacyAnalytics.js', text, path.name)

    def test_policy_describes_current_processing_and_international_summary_links_to_it(self):
        ko = (ROOT / 'privacy.html').read_text(encoding='utf-8')
        english = (ROOT / 'EN.html').read_text(encoding='utf-8')
        japanese = (ROOT / 'JP.html').read_text(encoding='utf-8')
        for forbidden in ('회원 가입 및 관리', '마케팅 정보 수신', '매물 등록 서비스'):
            self.assertNotIn(forbidden, ko)
        self.assertIn('id="analytics-control"', ko)
        self.assertIn('data-analytics-disable', ko)
        self.assertIn('data-analytics-enable', ko)
        self.assertIn('css/mobile.css', ko)
        self.assertIn('content: attr(data-label)', ko)
        self.assertGreaterEqual(ko.count('color: var(--lr-text-secondary);'), 3)
        self.assertGreaterEqual(ko.count('data-label='), 14)
        self.assertIn('수집일로부터 1년', ko)
        self.assertIn('동의하지 않으면 웹 문의를 접수할 수 없으며', ko)
        self.assertNotIn('동의하지 않으면 웹 문의를 접수할 수 있으며', ko)
        self.assertIn('검색 문장·전화번호·문의 내용은 분석 이벤트로 보내지 않습니다', ko)
        self.assertIn('제28조의8', ko)
        self.assertIn('별도 선택 동의', ko)
        self.assertIn('데이터 저장: 일본(도쿄)', ko)
        for guide in (english, japanese):
            self.assertIn('href="privacy.html"', guide)
            self.assertIn('id="privacy"', guide)
            self.assertIn('data-analytics-disable', guide)
            self.assertNotIn('<form', guide)

    def test_policy_names_the_confirmed_privacy_officer(self):
        ko = (ROOT / 'privacy.html').read_text(encoding='utf-8')
        english = (ROOT / 'EN.html').read_text(encoding='utf-8')
        japanese = (ROOT / 'JP.html').read_text(encoding='utf-8')

        self.assertNotIn('개인정보 보호책임자: 서봉현', ko)
        self.assertIn('개인정보 보호 문의: 대표전화 0507-1402-5055', ko)
        self.assertIn('개인정보 보호책임자: 서준혁', ko)
        self.assertIn('Privacy inquiries: 0507-1402-5055', english)
        self.assertIn('Privacy Officer: 서준혁', english)
        self.assertIn('個人情報に関するお問い合わせ 0507-1402-5055', japanese)
        self.assertIn('責任者 서준혁', japanese)

        ko_footer = ko.split('<footer class="lr-footer">', 1)[1]
        en_footer = english.split('<footer class="lr-footer">', 1)[1]
        jp_footer = japanese.split('<footer class="lr-footer">', 1)[1]
        self.assertIn('lr-footer__privacy-contact', ko_footer)
        self.assertIn('lr-footer__privacy-contact', en_footer)
        self.assertIn('lr-footer__privacy-contact', jp_footer)

        ko_home_footer = (ROOT / 'index.html').read_text(encoding='utf-8').split('<footer class="lr-footer">', 1)[1]
        self.assertIn('개인정보 보호 문의 0507-1402-5055', ko_home_footer)
        self.assertIn('.lr-footer__privacy-contact', (ROOT / 'style.css').read_text(encoding='utf-8'))

    def test_widget_claim_is_limited_to_search_query_transmission(self):
        text = (ROOT / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        self.assertIn('검색 문장은 분석 도구로 보내지 않음', text)
        self.assertNotIn('자료 질문은 저장 안 함', text)


if __name__ == '__main__':
    unittest.main()
