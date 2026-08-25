import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class KnowledgeSearchPageTest(unittest.TestCase):
    def test_knowledge_page_has_source_grounded_question_search(self):
        text = (REPO / 'knowledge.html').read_text(encoding='utf-8')
        required = (
            'id="knowledge-search-form"',
            'id="knowledge-search-input"',
            'id="knowledge-search-results"',
            'aria-live="polite"',
            'js/knowledgePage.js',
            'js/analyticsEvents.js',
            '공개된 자료에서만 찾아드립니다',
            '개별 법률 자문이 아닙니다',
        )
        self.assertEqual([marker for marker in required if marker not in text], [])

    def test_core_korean_navigation_links_to_knowledge_search(self):
        missing = []
        for name in ('index.html', 'listings.html', 'report.html', 'disputes.html', 'contact.html'):
            text = (REPO / name).read_text(encoding='utf-8', errors='ignore')
            if 'href="knowledge.html"' not in text:
                missing.append(name)
        self.assertEqual(missing, [])

    def test_adapter_has_full_content_reader_for_live_auto_updates(self):
        text = (REPO / 'js/services/reportAdapter.js').read_text(encoding='utf-8')
        self.assertIn('listPublishedKnowledgeReports', text)
        self.assertIn('report_md', text)
        self.assertIn('evidence_json', text)

    def test_knowledge_page_is_in_sitemap(self):
        text = (REPO / 'Sitemap.xml').read_text(encoding='utf-8')
        self.assertIn('<loc>https://lottes.co.kr/knowledge.html</loc>', text)

    def test_public_page_does_not_claim_a_live_ai_answer(self):
        text = (REPO / 'knowledge.html').read_text(encoding='utf-8')
        self.assertNotIn('AI가 답변', text)
        self.assertNotIn('법률 상담 챗봇', text)


if __name__ == '__main__':
    unittest.main()
