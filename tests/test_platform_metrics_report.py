import calendar
import json
from pathlib import Path
import subprocess
import sys
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/platform_metrics_report.py'


def invoke(data):
    return raw(json.dumps(data))


def raw(text):
    return subprocess.run(
        [sys.executable, '-B', '-X', 'utf8', str(SCRIPT)],
        input=text, capture_output=True, encoding='utf-8', check=False,
    )


class MetricsReportTests(unittest.TestCase):
    def report(self, **data):
        result = invoke({'month': '2024-02', **data})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, '')
        return result.stdout

    def test_four_sections_and_separate_sources(self):
        report = self.report(
            comparable_results=True,
            platform={'phone_clicks': 27, 'listing_requests': 15, 'new_publications': 3,
                      'site_visit': 2, 'owner_listed': 1, 'tenant_listed': 1,
                      'calls': 5, 'stored_forms': 8, 'inquiries': 11,
                      'ad_spend_krw': 345, 'contracts': 3},
            zigbang={'receipt_days_observed': calendar.monthrange(2024, 2)[1],
                     'receipt_count': 91, 'ad_spend_krw': 1200, 'contracts': 4},
        )
        self.assertEqual([line for line in report.splitlines() if line.startswith('## ')],
                         ['## 행동 신호', '## 공급', '## 문의', '## 결과'])
        for row in ('| 전화 버튼 클릭 | — | 27 |', '| 등록 요청 | — | 15 |',
                    '| 임장 확인 비율 | — | 50.0% (2/4) |',
                    '| 직방 메일 알림 건수 | 91 | — |', '| 실제 통화 | 미확인 | 5 |',
                    '| 승인된 저장 폼 | — | 8 |', '| 확인된 중복 제거 문의 | 미확인 | 11 |',
                    '| 문의당 비용 (원) | 미확인 | 31 |', '| 계약당 비용 (원) | 300 | 115 |'):
            self.assertIn(row, report)

    def test_gap_does_not_publish_partial_count(self):
        report = self.report(zigbang={'receipt_days_observed': 28, 'receipt_count': 731})
        self.assertIn('| 직방 메일 알림 건수 | 미확인 | — |', report)
        self.assertNotIn('731', report)
        self.assertIn('28/29', report)

    def test_verified_zero_is_not_missing(self):
        report = self.report(zigbang={'receipt_days_observed': 29, 'receipt_count': 0},
                             platform={'inquiries': 0, 'ad_spend_krw': 0})
        self.assertIn('| 직방 메일 알림 건수 | 0 | — |', report)
        self.assertIn('| 확인된 중복 제거 문의 | 미확인 | 0 |', report)
        self.assertIn('| 문의당 비용 (원) | 미확인 | — |', report)
        self.assertIn('| 계약당 비용 (원) | 미확인 | 미확인 |', report)

    def test_costs_do_not_infer_missing_or_noncomparable_denominators(self):
        report = self.report(comparable_results=False, zigbang={'ad_spend_krw': 0, 'contracts': 2},
                             platform={'calls': 6, 'stored_forms': 4, 'ad_spend_krw': 100,
                                       'contracts': 2, 'site_visit': 0})
        self.assertIn('채널 간 비교 불가', report)
        self.assertIn('| 문의당 비용 (원) | 미확인 | 미확인 |', report)
        self.assertIn('| 계약당 비용 (원) | 0 | 50 |', report)
        self.assertIn('| 임장 확인 비율 | — | 미확인 |', report)
        self.assertIn('채널 간 비교 미확인', self.report())

    def test_unknown_spend_with_positive_denominator_is_unavailable(self):
        report = self.report(platform={'contracts': 2, 'inquiries': 4})
        self.assertIn('| 계약당 비용 (원) | 미확인 | 미확인 |', report)
        self.assertIn('| 문의당 비용 (원) | 미확인 | 미확인 |', report)

    def test_quality_metrics_require_complete_denominators(self):
        report = self.report(platform={'visible_listings': 4, 'needs_recheck': 1,
                                       'close_lag_observed': 2, 'close_lag_days': 5})
        self.assertIn('재확인 필요: 25.0% (1/4)', report)
        self.assertIn('평균 반영 지연: 2.5일 (2건)', report)
        self.assertIn('재확인 필요: 미확인', self.report(platform={'needs_recheck': 1}))

    def test_deterministic_and_no_cross_month_inference(self):
        self.assertEqual(self.report(platform={'ad_spend_krw': 100, 'contracts': 3}),
                         self.report(platform={'contracts': 3, 'ad_spend_krw': 100}))
        result = invoke({'month': '2025-02', 'zigbang': {'receipt_days_observed': 29}})
        self.assertEqual(result.returncode, 2)

    def test_invalid_input_fails_without_echo_or_partial_report(self):
        for text in (
            '{"month":"2024-02", "synthetic-private-marker":0}',
            '{"month":"2024-02","platform":{"contracts":"synthetic-private-marker"}}',
            '{"month":"2024-02","platform":{"contracts":0,"contracts":2}}',
            '{"month":"2024-02","platform":{"contracts":true}}',
            '{"month":"2024-02","zigbang":{"receipt_count":-1}}',
            '{"month":"2024-02","platform":{"contracts":NaN}}',
            '{"month":"2024-02","platform":{"needs_recheck":3,"visible_listings":2}}',
            '{"month":"2024-2"}', '{"month":"0000-02"}', '[]', 'synthetic-private-marker',
        ):
            with self.subTest(text=text):
                result = raw(text)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr.strip(), 'Invalid aggregate metrics input.')
