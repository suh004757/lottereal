import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy

ROOT = Path(__file__).resolve().parents[1]
NEW_PAYLOAD = ROOT / 'content' / 'daily' / '2026-09-06-songpa-apartment-real-trade-cancellation-check.json'
UPDATE_PAYLOAD = ROOT / 'content' / 'curated' / '2026-09-06-seoul-real-estate-funding-and-data-check-update.json'


class SeptemberSixDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new_report = json.loads(NEW_PAYLOAD.read_text(encoding='utf-8'))
        cls.updated_report = json.loads(UPDATE_PAYLOAD.read_text(encoding='utf-8'))

    def test_new_article_has_stable_daily_identity_and_required_sections(self):
        report = self.new_report
        self.assertEqual(report['slug'], '2026-09-06-songpa-apartment-real-trade-cancellation-check')
        self.assertEqual(report['status'], 'published')
        self.assertEqual(report['metadata']['as_of'], '2026-09-06')
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report['report_md']), 700)
        self.assertIn('https://lottes.co.kr/contact.html', report['report_md'])
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        self.assertIn('report.html?slug=' + report['slug'], sitemap)

    def test_new_article_is_source_grounded_without_unsupported_songpa_price_claim(self):
        report = self.new_report
        urls = {source['url'] for source in report['evidence_json']}
        self.assertIn('https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do', urls)
        self.assertIn('https://rt.molit.go.kr/pt/info/info.do', urls)
        self.assertIn('https://rt.molit.go.kr/pt/xls/xls.do?mobileAt', urls)
        for phrase in ('계약일부터 30일 이내', '취소일', '2026년 9월 4일'):
            self.assertIn(phrase, report['report_md'])
        for unsupported in ('송파구 매매가격 상승', '잠실 집값 상승', '송파 거래량 증가'):
            self.assertNotIn(unsupported, report['report_md'])

    def test_existing_url_update_preserves_identity_and_publication_time(self):
        report = self.updated_report
        self.assertEqual(report['slug'], '2026-08-23-seoul-real-estate-funding-and-data-check')
        self.assertEqual(report['metadata']['first_published_at'], '2026-08-23T09:42:09.619412+00:00')
        self.assertEqual(report['metadata']['last_reviewed'], '2026-09-06')
        self.assertIn('> 최초 발행: 2026년 8월 23일', report['report_md'])
        self.assertIn('> 수정·자료 확인: 2026년 9월 6일', report['report_md'])
        self.assertEqual(validate_report_copy(report), [])
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        entry = 'report.html?slug=' + report['slug']
        start = sitemap.index(entry)
        self.assertIn('<lastmod>2026-09-06</lastmod>', sitemap[start:start + 220])

    def test_public_copy_avoids_internal_language_and_ai_tells(self):
        combined = self.new_report['report_md'] + self.updated_report['report_md']
        for forbidden in ('운영 기준', '예측 검색어', '프롬프트', 'API 키', 'MCP', '—', 'Executive Summary'):
            self.assertNotIn(forbidden, combined)


if __name__ == '__main__':
    unittest.main()
