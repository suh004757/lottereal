import json
import re
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy

ROOT = Path(__file__).resolve().parents[1]
BACKFILL = ROOT / 'content' / 'curated' / '2026-08-28-report-depth-backfill.json'


def prose_length(markdown):
    plain = re.sub(r'[#*`>\[\]()|_-]', ' ', markdown)
    return len(' '.join(plain.split()))


class ReportDepthBackfillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reports = json.loads(BACKFILL.read_text(encoding='utf-8'))

    def test_backfill_contains_seventeen_unique_published_reports(self):
        self.assertEqual(len(self.reports), 17)
        slugs = [report['slug'] for report in self.reports]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertTrue(all(report['status'] == 'published' for report in self.reports))

    def test_each_report_has_reader_depth_sources_and_required_sections(self):
        for report in self.reports:
            body = report['report_md']
            self.assertGreaterEqual(prose_length(body), 2000, report['slug'])
            self.assertLessEqual(prose_length(body), 5000, report['slug'])
            self.assertGreaterEqual(len(report['evidence_json']), 2, report['slug'])
            self.assertEqual(validate_report_copy(report), [], report['slug'])
            for heading in ('## 먼저 볼 내용', '## 확인된 흐름', '## 상담 전에 확인할 점', '## 자료와 한계'):
                self.assertIn(heading, body, report['slug'])

    def test_public_copy_excludes_internal_operating_language(self):
        combined = '\n'.join(report['report_md'] for report in self.reports).lower()
        for phrase in ('운영 기준', '예측 검색어', '프롬프트', 'api 키', 'mcp'):
            self.assertNotIn(phrase.lower(), combined)


if __name__ == '__main__':
    unittest.main()
