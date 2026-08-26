from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class InquiryMvpPageTest(unittest.TestCase):
    def test_database_migration_rejects_null_and_unconsented_inquiries(self):
        migration = (REPO / 'supabase/migrations/006_validate_inquiry_rows.sql').read_text(encoding='utf-8')
        self.assertIn('phone is not null', migration.lower())
        self.assertIn("metadata @> '{\"privacy_consent\": true}'::jsonb", migration)
        self.assertIn("metadata->>'inquiry_type'", migration)
        self.assertIn("metadata->>'source_channel'", migration)
        self.assertIn("metadata->>'callback_time'", migration)
        self.assertIn("cmd in ('ALL', 'INSERT')", migration)
        self.assertIn('create policy inquiries_public_insert', migration)
        self.assertIn('with check (', migration)
        self.assertIn("metadata->>'source' = 'public-inquiry-mvp'", migration)
        self.assertIn("phone ~ '^[0-9]{9,11}$'", migration)
        self.assertIn('octet_length(metadata::text) <= 4000', migration)

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
        self.assertNotIn('createInquiryMock', inquiry_insert)
        self.assertIn('throw new Error', inquiry_insert)

        mock_start = adapter.index('async function createInquiryMock')
        mock_end = adapter.index('async function listListingsPublicSupabase', mock_start)
        self.assertNotIn("console.log('[Mock Backend] createInquiry payload', payload)", adapter[mock_start:mock_end])

    def test_contact_controller_saves_first_then_emits_non_pii_event(self):
        script = (REPO / 'js/contactInquiry.js').read_text(encoding='utf-8')
        self.assertIn("createInquiry(payload)", script)
        self.assertIn('buildInquiryPayload', script)
        self.assertIn('inquiryValuesFromFormData', script)
        self.assertIn('buildInquiryPayload(inquiryValuesFromFormData(data))', script)
        self.assertIn('buildInquiryAnalyticsEvent', script)
        self.assertIn('result.persisted !== true', script)
        self.assertIn("form.elements.sourceChannel.addEventListener('change', syncListingReference)", script)
        self.assertLess(script.index('await createInquiry(payload)'), script.index("window.gtag('event'"))
        analytics_call = script[script.index("window.gtag('event'"):]
        self.assertNotIn('payload.phone', analytics_call)
        self.assertNotIn('payload.message', analytics_call)
        self.assertNotIn('external_listing_ref', analytics_call)

    def test_privacy_policy_matches_minimal_inquiry_collection(self):
        policy = (REPO / 'privacy.html').read_text(encoding='utf-8')
        self.assertIn('전화 요청·매물 문의·일반 상담', policy)
        self.assertIn('전화번호, 문의 유형, 유입 경로, 희망 연락시간, 수집·이용 동의', policy)
        self.assertIn('이름, 외부 매물번호 또는 사이트 내 매물, 문의 내용', policy)
        self.assertIn('수집일로부터 1년', policy)
        self.assertIn('광고 발송이나 AI 학습 목적으로 이용하지 않습니다', policy)

    def test_home_mobile_actionbar_includes_direct_inquiry_action(self):
        html = (REPO / 'index.html').read_text(encoding='utf-8')
        css = (REPO / 'style.css').read_text(encoding='utf-8')
        self.assertIn('<a href="contact.html#inquiry-options"><span>💬</span><strong>문의하기</strong></a>', html)
        self.assertIn('grid-auto-columns: minmax(0, 1fr);', css)

    def test_listing_detail_uses_guided_chat_with_automatic_listing_context(self):
        html = (REPO / 'listing-detail.html').read_text(encoding='utf-8')
        detail = (REPO / 'js/listingDetail.js').read_text(encoding='utf-8')
        widget = (REPO / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        chat = (REPO / 'js/inquiryChat.js').read_text(encoding='utf-8')
        self.assertNotIn('data-inquiry-form', html)
        self.assertGreaterEqual(html.count('data-listing-chat-open'), 2)
        self.assertNotIn('createInquiry', detail)
        self.assertIn("lottereal:open-inquiry", detail)
        self.assertIn('listingId: listing.id', detail)
        self.assertIn('listingTitle: listing.title', detail)
        self.assertIn("addEventListener('lottereal:open-inquiry'", widget)
        self.assertIn("openPanel('inquiry')", widget)
        self.assertIn("addEventListener('inquiry-chat-context'", chat)
        self.assertIn('payload.listingId = state.listingContext.listingId', chat)
        self.assertIn('payload.listingTitle = state.listingContext.listingTitle', chat)
        analytics_start = chat.index("window.gtag('event'")
        analytics_end = chat.index('state.complete = true', analytics_start)
        analytics_call = chat[analytics_start:analytics_end]
        self.assertNotIn('listingId', analytics_call)
        self.assertNotIn('listingTitle', analytics_call)

    def test_mobile_actions_keep_phone_and_offer_inquiry_without_covering_search(self):
        html = (REPO / 'contact.html').read_text(encoding='utf-8')
        css = (REPO / 'css/inquiry-mvp.css').read_text(encoding='utf-8')
        self.assertIn('href="tel:050714025055"', html)
        self.assertIn('href="#inquiry-options"', html)
        self.assertIn('.lr-inquiry-actions', css)
        self.assertIn('@media (max-width: 768px)', css)


if __name__ == '__main__':
    unittest.main()
