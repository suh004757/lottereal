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
            'id="knowledge-community-pulse"',
            '최근 많이 본 질문',
            'aria-live="polite"',
            'js/knowledgePage.js',
            'js/analyticsEvents.js',
            '공개된 자료에서만 찾아드립니다',
            '개별 법률 자문이 아닙니다',
        )
        self.assertEqual([marker for marker in required if marker not in text], [])
        self.assertIn('이 기능의 분석 이벤트에는 입력한 검색 문장이나 직접 식별정보를 포함하지 않습니다.', text)
        self.assertNotIn('개인정보나 검색 문장은 저장하지 않습니다.', text)

    def test_core_korean_navigation_links_to_knowledge_search(self):
        missing = []
        for name in ('index.html', 'listings.html', 'report.html', 'disputes.html', 'contact.html'):
            text = (REPO / name).read_text(encoding='utf-8', errors='ignore')
            if 'href="knowledge.html"' not in text:
                missing.append(name)
        self.assertEqual(missing, [])

    def test_adapter_pages_through_all_published_content(self):
        text = (REPO / 'js/services/reportAdapter.js').read_text(encoding='utf-8')
        self.assertIn('listPublishedKnowledgeReports', text)
        self.assertIn(".select('id, slug, title, summary, report_md, evidence_json", text)
        self.assertIn('.range(from, to)', text)
        self.assertIn('collectPaginatedReports', text)
        pager = (REPO / 'js/services/knowledgeReportPager.mjs').read_text(encoding='utf-8')
        self.assertIn('while (true)', pager)
        self.assertIn('if (error) throw error', pager)

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

    def test_community_pulse_has_visible_focus_and_reduced_motion_styles(self):
        css = (REPO / 'css/knowledge.css').read_text(encoding='utf-8')
        self.assertIn('.lr-community-pulse__card a:focus-visible', css)
        self.assertIn('color: #756e64;', css)
        self.assertIn('outline: 3px solid #8a5b28;', css)
        self.assertIn('.lr-community-pulse__card { transition: none; }', css)


if __name__ == '__main__':
    unittest.main()
