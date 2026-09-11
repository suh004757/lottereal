import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'content' / 'daily' / '2026-09-11-songpa-shared-management-fee-check.json'


class SeptemberElevenDailyContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding='utf-8'))

    def test_daily_identity_copy_and_contact_path(self):
        report = self.report
        self.assertEqual(report['slug'], '2026-09-11-songpa-shared-management-fee-check')
        self.assertEqual(report['status'], 'published')
        self.assertEqual(report['metadata']['as_of'], '2026-09-11')
        self.assertEqual(validate_report_copy(report), [])
        self.assertGreaterEqual(len(report['report_md']), 700)
        self.assertIn('https://lottes.co.kr/contact.html', report['report_md'])

    def test_article_is_grounded_in_current_official_change(self):
        report = self.report
        urls = {source['url'] for source in report['evidence_json']}
        self.assertTrue(any('law.go.kr' in url for url in urls))
        self.assertTrue(any('irts.molit.go.kr' in url for url in urls))
        for phrase in ('2026년 8월 28일', '공동관리비', '관리비 총액', '별도 계량'):
            self.assertIn(phrase, report['report_md'])
        for unsupported in ('송파 관리비 상승', '잠실 월세 상승', '관리비가 내려갑니다'):
            self.assertNotIn(unsupported, report['report_md'])

    def test_daily_report_is_discoverable_in_sitemap(self):
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        self.assertIn('report.html?slug=' + self.report['slug'], sitemap)


if __name__ == '__main__':
    unittest.main()
