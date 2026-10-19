import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportLandingConfigByKey, selectLandingReports } from '../public/js/config/reportLandingConfig.js';

const report = (slug, title, contentType, createdAt) => ({
  slug, title, summary: '', created_at: createdAt, metadata: { content_type: contentType },
});

test('dispute hub keeps only dispute cases, newest first', () => {
  const config = getReportLandingConfigByKey('dispute-cases');
  const selected = selectLandingReports([
    report('old-case', '누수 분쟁', 'dispute_case', '2026-08-01T00:00:00Z'),
    report('checklist', '보증금 계약 확인', 'legal_checklist', '2026-10-01T00:00:00Z'),
    report('new-case', '곰팡이 분쟁', 'dispute_case', '2026-09-01T00:00:00Z'),
  ], config);
  assert.deepEqual(selected.map((item) => item.slug), ['new-case', 'old-case']);
});

test('area hub matches by keyword and drops unrelated reports', () => {
  const config = getReportLandingConfigByKey('jamsil-market-report');
  const selected = selectLandingReports([
    report('jamsil', '잠실 아파트 관리비', 'market_report', '2026-10-01T00:00:00Z'),
    report('busan', '부산 해운대 시세', 'market_report', '2026-10-02T00:00:00Z'),
  ], config);
  assert.deepEqual(selected.map((item) => item.slug), ['jamsil']);
});
