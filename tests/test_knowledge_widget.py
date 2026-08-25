import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CORE_KOREAN_PAGES = (
    'index.html',
    'listings.html',
    'listing-detail.html',
    'report.html',
    'disputes.html',
    'contact.html',
    'insights.html',
    'insight-detail.html',
    'songpa-market-report.html',
    'jamsil-market-report.html',
    'gangnam-office-report.html',
)


class KnowledgeWidgetTest(unittest.TestCase):
    def test_core_korean_pages_load_the_source_search_widget(self):
        missing = []
        for name in CORE_KOREAN_PAGES:
            text = (REPO / name).read_text(encoding='utf-8', errors='ignore')
            if 'js/knowledgeWidget.js' not in text:
                missing.append(name)
        self.assertEqual(missing, [])

    def test_widget_is_an_accessible_source_search_drawer(self):
        text = (REPO / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        for marker in (
            'listPublishedKnowledgeReports',
            "from './knowledgeSearch.mjs'",
            'role="dialog"',
            'aria-modal="true"',
            "event.key === 'Escape'",
            "event.key === 'Tab'",
            'focusableElements',
            'slice(0, 3)',
            'knowledge_widget_open',
            'knowledge_widget_search',
            'knowledge.html',
            'lr-mobile-actionbar',
        ):
            self.assertIn(marker, text)
        self.assertNotIn('query_text', text)
        self.assertNotIn('raw_query', text)

    def test_widget_offers_guided_inquiry_using_the_existing_secure_pipeline(self):
        widget = (REPO / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        chat = (REPO / 'js/inquiryChat.js').read_text(encoding='utf-8')
        self.assertIn("from './inquiryChat.js'", widget)
        self.assertIn('data-widget-mode="knowledge"', widget)
        self.assertIn('data-widget-mode="inquiry"', widget)
        self.assertIn('data-inquiry-chat', widget)
        self.assertIn("from './inquiryMvp.js'", chat)
        self.assertIn("import('./services/backendAdapter.js')", chat)
        self.assertIn('buildInquiryPayload', chat)
        self.assertIn('privacyConsent', chat)
        self.assertIn("event.submitter?.classList.contains('is-secondary')", chat)
        self.assertIn('isPersistedInquiryResult(result)', chat)
        self.assertNotIn("state.status = error?.message", chat)
        self.assertIn("name: '이름'", chat)
        self.assertIn("phone: '연락처'", chat)
        self.assertIn("externalListingRef: '매물번호'", chat)
        self.assertIn('aria-label="${escapeHtml(FIELD_LABELS[field])}"', chat)
        self.assertIn('aria-label="추가 문의 내용"', chat)
        self.assertNotIn('<div class="lr-inquiry-chat" aria-live="polite">', chat)
        self.assertLess(chat.index('await createInquiry(payload)'), chat.index("window.gtag('event'"))
        analytics_call = chat[chat.index("window.gtag('event'"):]
        self.assertNotIn('payload.phone', analytics_call)
        self.assertNotIn('payload.message', analytics_call)

    def test_widget_styles_support_desktop_drawer_and_mobile_bottom_sheet(self):
        text = (REPO / 'css/knowledge-widget.css').read_text(encoding='utf-8')
        for marker in (
            '.lr-knowledge-widget__launcher',
            '.lr-knowledge-widget__panel',
            '.lr-knowledge-widget__backdrop',
            '@media (max-width: 640px)',
            'prefers-reduced-motion',
        ):
            self.assertIn(marker, text)
        start = text.index('.lr-knowledge-widget__modes button {')
        end = text.index('.lr-knowledge-widget__modes button[aria-selected', start)
        self.assertIn('min-height: 44px;', text[start:end])

    def test_mobile_listing_inquiry_keeps_the_current_question_stable(self):
        chat = (REPO / 'js/inquiryChat.js').read_text(encoding='utf-8')
        styles = (REPO / 'css/knowledge-widget.css').read_text(encoding='utf-8')
        self.assertIn('lr-inquiry-chat__listing-context', chat)
        self.assertIn('class="lr-inquiry-chat__prompt" aria-live="polite" tabindex="-1"', chat)
        mobile_start = styles.index('@media (max-width: 640px)')
        mobile_block = styles[mobile_start:]
        self.assertIn('.lr-inquiry-chat__history { display: none; }', mobile_block)
        self.assertIn('height: 82vh;', mobile_block)
        self.assertIn('--kw-visual-viewport-height', mobile_block)
        self.assertIn('--kw-visual-viewport-bottom', mobile_block)
        self.assertIn('env(safe-area-inset-bottom', mobile_block)
        self.assertIn('display: flex;', mobile_block)
        self.assertIn('box-sizing: border-box;', mobile_block)
        self.assertIn('flex: 1 1 auto;', mobile_block)
        self.assertIn('min-height: 0;', mobile_block)
        widget = (REPO / 'js/knowledgeWidget.js').read_text(encoding='utf-8')
        self.assertIn('window.visualViewport', widget)
        self.assertIn("visualViewport.addEventListener('resize'", widget)
        self.assertIn('!panel.contains(document.activeElement)', widget)
        self.assertIn('closeButton', widget)

    def test_homepage_keeps_only_two_representative_content_cards(self):
        html = (REPO / 'index.html').read_text(encoding='utf-8')
        script = (REPO / 'js/homeReportPreview.js').read_text(encoding='utf-8')
        self.assertIn('오늘 확인할 두 가지', html)
        self.assertNotIn('lr-section--report-hubs', html)
        self.assertNotIn('id="legal-updates"', html)
        self.assertNotIn('data-feed-list', html)
        self.assertIn('selectRepresentativeReports', script)
        self.assertIn("content_type === 'dispute_case'", script)
        self.assertNotIn('formatViews(', script)


if __name__ == '__main__':
    unittest.main()
