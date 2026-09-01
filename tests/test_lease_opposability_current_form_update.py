import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'content' / 'curated' / '2026-09-01-lease-opposability-current-form-update.json'
ORIGINAL_SLUG = '2026-08-23-lease-opposability-checklist'


class LeaseOpposabilityCurrentFormUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding='utf-8'))

    def test_preserves_stable_url_and_original_publication_date(self):
        self.assertEqual(self.report['slug'], ORIGINAL_SLUG)
        metadata = self.report['metadata']
        self.assertTrue(metadata['first_published_at'].startswith('2026-08-23T'))
        self.assertEqual(metadata['last_reviewed'], '2026-09-01')
        self.assertIn('> 최초 발행: 2026년 8월 23일', self.report['report_md'])
        self.assertIn('> 수정·자료 확인: 2026년 9월 1일', self.report['report_md'])
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        entry = 'https://lottes.co.kr/report.html?slug=' + ORIGINAL_SLUG
        self.assertIn(entry, sitemap)
        start = sitemap.index(entry)
        self.assertIn('<lastmod>2026-09-01</lastmod>', sitemap[start:start + 250])

    def test_current_form_update_is_source_grounded_and_practical(self):
        body = self.report['report_md']
        for phrase in ('신탁등기', '공동담보', '공동관리비', '설명 근거자료'):
            self.assertIn(phrase, body)
        urls = {source['url'] for source in self.report['evidence_json']}
        self.assertIn('https://law.go.kr/LSW/lsLawLinkInfo.do?lsJoLnkSeq=900140903', urls)
        self.assertIn('https://irts.molit.go.kr/', urls)
        self.assertIn('https://housing.seoul.go.kr/site/main/content/sh04_050002', urls)

    def test_connects_contract_preparation_to_existing_dispute_guides(self):
        body = self.report['report_md']
        self.assertIn('slug=2026-08-25-rental-move-in-address-unit-number-opposability', body)
        self.assertIn('slug=2026-08-25-rental-new-owner-deposit-refund-liability', body)

    def test_public_copy_validation_passes(self):
        body = self.report['report_md']
        self.assertGreaterEqual(len(body), 700)
        for heading in ('## 먼저 볼 내용', '## 확인된 흐름', '## 상담 전에 확인할 점', '## 자료와 한계'):
            self.assertIn(heading, body)
        for forbidden in ('운영 기준', '예측 검색어', '프롬프트', 'API 키', 'MCP'):
            self.assertNotIn(forbidden, body)


if __name__ == '__main__':
    unittest.main()
