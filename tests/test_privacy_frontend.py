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

    def test_english_inquiry_is_minimal_and_requires_privacy_consent(self):
        html = (ROOT / 'listing-detail-en.html').read_text(encoding='utf-8')
        js = (ROOT / 'js/listingDetail.en.js').read_text(encoding='utf-8')
        self.assertNotIn('name="email"', html)
        self.assertNotIn('name="name" type="text" required', html)
        self.assertIn('name="privacyConsent"', html)
        self.assertIn('privacy_EN.html', html)
        self.assertIn('Retention: 1 year from collection.', html)
        self.assertNotIn('Retention: 1 year after consultation.', html)
        self.assertIn("formData.has('privacyConsent')", js)
        self.assertIn('buildInquiryPayload', js)
        helper = (ROOT / 'js/inquiryMvp.js').read_text(encoding='utf-8')
        self.assertIn("source: 'public-inquiry-mvp'", helper)
        self.assertNotIn('listing_title:', js)

    def test_admin_pages_do_not_load_public_analytics(self):
        for path in (ROOT / 'admin').glob('*.html'):
            text = path.read_text(encoding='utf-8', errors='ignore')
            self.assertNotIn('googletagmanager.com', text, path.name)
            self.assertNotIn('privacyAnalytics.js', text, path.name)

    def test_policy_describes_current_processing_and_exposes_analytics_control(self):
        ko = (ROOT / 'privacy.html').read_text(encoding='utf-8')
        en = (ROOT / 'privacy_EN.html').read_text(encoding='utf-8')
        for forbidden in ('회원 가입 및 관리', '마케팅 정보 수신', '매물 등록 서비스'):
            self.assertNotIn(forbidden, ko)
        for forbidden in ('Membership registration', 'Marketing information', 'Property listing service'):
            self.assertNotIn(forbidden, en)
        self.assertIn('id="analytics-control"', ko)
        self.assertIn('data-analytics-disable', ko)
        self.assertIn('data-analytics-enable', ko)
        self.assertIn('id="analytics-control"', en)
        self.assertIn('css/mobile.css', ko)
        self.assertIn('css/mobile.css', en)
        self.assertIn('content: attr(data-label)', ko)
        self.assertIn('content: attr(data-label)', en)
        self.assertGreaterEqual(ko.count('color: var(--lr-text-secondary);'), 3)
        self.assertGreaterEqual(en.count('color: var(--lr-text-secondary);'), 3)
        self.assertGreaterEqual(ko.count('data-label='), 14)
        self.assertGreaterEqual(en.count('data-label='), 14)
        self.assertIn('수집일로부터 1년', ko)
        self.assertIn('동의하지 않으면 웹 문의를 접수할 수 없으며', ko)
        self.assertNotIn('동의하지 않으면 웹 문의를 접수할 수 있으며', ko)
        self.assertIn('1 year from collection', en)
        self.assertIn('검색 문장·전화번호·문의 내용은 분석 이벤트로 보내지 않습니다', ko)
        self.assertIn('제28조의8', ko)
        self.assertIn('별도 선택 동의', ko)
        self.assertIn('데이터 저장: 일본(도쿄)', ko)
        self.assertIn('Data storage: Tokyo, Japan', en)
        self.assertNotIn('선택된 프로젝트 저장 리전', ko)
        self.assertNotIn('Selected project storage region', en)

    def test_widget_claim_is_limited_to_search_query_transmission(self):
        text = (ROOT / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        self.assertIn('검색 문장은 분석 도구로 보내지 않음', text)
        self.assertNotIn('자료 질문은 저장 안 함', text)


if __name__ == '__main__':
    unittest.main()
