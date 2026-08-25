from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class InquiryMvpPageTest(unittest.TestCase):
    def test_home_inquiry_links_open_the_real_form_instead_of_scrolling(self):
        html = (REPO / 'index.html').read_text(encoding='utf-8')
        self.assertNotIn('<a href="#contact">문의</a>', html)
        self.assertGreaterEqual(html.count('href="contact.html#inquiry-options"'), 2)

    def test_contact_page_has_simple_no_login_inquiry_flow(self):
        html = (REPO / 'contact.html').read_text(encoding='utf-8')
        self.assertIn('id="inquiry-options"', html)
        self.assertIn('data-inquiry-mvp-form', html)
        self.assertIn('name="inquiryType"', html)
        for value in ('callback', 'listing', 'consultation'):
            self.assertIn(f'value="{value}"', html)
        self.assertIn('name="sourceChannel"', html)
        for value in ('website', 'zigbang', 'dabang', 'naver', 'other'):
            self.assertIn(f'value="{value}"', html)
        self.assertIn('name="externalListingRef"', html)
        self.assertIn('name="callbackTime"', html)
        self.assertIn('name="privacyConsent"', html)
        self.assertIn('data-inquiry-status', html)
        self.assertIn('href="privacy.html"', html)
        self.assertIn('js/contactInquiry.js', html)
        self.assertIn('css/inquiry-mvp.css', html)

    def test_public_inquiry_insert_does_not_request_customer_row_back(self):
        adapter = (REPO / 'js/services/backendAdapter.js').read_text(encoding='utf-8')
        start = adapter.index('async function createInquirySupabase')
        end = adapter.index('async function createInquiryMock', start)
        inquiry_insert = adapter[start:end]
        self.assertIn(".from('inquiries')", inquiry_insert)
        self.assertIn('.insert([', inquiry_insert)
        self.assertNotIn('.select()', inquiry_insert)

    def test_contact_controller_saves_first_then_emits_non_pii_event(self):
        script = (REPO / 'js/contactInquiry.js').read_text(encoding='utf-8')
        self.assertIn("createInquiry(payload)", script)
        self.assertIn('buildInquiryPayload', script)
        self.assertIn('buildInquiryAnalyticsEvent', script)
        self.assertIn("form.elements.sourceChannel.addEventListener('change', syncListingReference)", script)
        self.assertLess(script.index('await createInquiry(payload)'), script.index("window.gtag('event'"))
        analytics_call = script[script.index("window.gtag('event'"):]
        self.assertNotIn('payload.phone', analytics_call)
        self.assertNotIn('payload.message', analytics_call)
        self.assertNotIn('external_listing_ref', analytics_call)

    def test_privacy_policy_matches_minimal_inquiry_collection(self):
        policy = (REPO / 'privacy.html').read_text(encoding='utf-8')
        self.assertIn('전화 요청 및 매물·일반 상담', policy)
        self.assertIn('연락처(전화번호), 문의 유형, 유입 경로, 희망 연락시간', policy)
        self.assertIn('이름, 외부 플랫폼 매물번호, 문의 내용', policy)
        self.assertIn('상담 완료 후 1년', policy)

    def test_mobile_actions_keep_phone_and_offer_inquiry_without_covering_search(self):
        html = (REPO / 'contact.html').read_text(encoding='utf-8')
        css = (REPO / 'css/inquiry-mvp.css').read_text(encoding='utf-8')
        self.assertIn('href="tel:050714025055"', html)
        self.assertIn('href="#inquiry-options"', html)
        self.assertIn('.lr-inquiry-actions', css)
        self.assertIn('@media (max-width: 768px)', css)


if __name__ == '__main__':
    unittest.main()
