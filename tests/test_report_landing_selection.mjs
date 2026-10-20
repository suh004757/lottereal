import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatchingLandingConfigs, getReportLandingConfigByKey, reportBreadcrumbSection, selectLandingReports } from '../public/js/config/reportLandingConfig.js';

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

test('Gangnam office hub requires office or commercial relevance', () => {
  const config = getReportLandingConfigByKey('gangnam-office-report');
  const housing = report('gangnam-home', '강남 아파트 매매 흐름', 'market_report', '2026-10-03T00:00:00Z');
  housing.metadata.region = 'gangnam';
  const office = report('gangnam-office', '강남 사무실 임대 조건', 'market_report', '2026-10-01T00:00:00Z');
  office.metadata.region = 'gangnam';
  const otherOffice = report('jamsil-office', '잠실 사무실 임대 조건', 'market_report', '2026-10-02T00:00:00Z');
  otherOffice.metadata.region = 'jamsil';
  assert.deepEqual(selectLandingReports([housing, office, otherOffice], config).map((item) => item.slug), ['gangnam-office']);
  assert.equal(
    findMatchingLandingConfigs(housing).some((item) => item.key === 'gangnam-office-report'),
    false,
  );
});

test('hub relevance score is applied before publication recency', () => {
  const config = getReportLandingConfigByKey('jamsil-market-report');
  const newerWeak = report('newer-weak', '잠실 생활권 소식', 'market_report', '2026-10-03T00:00:00Z');
  const olderStrong = report('older-strong', '잠실 송파 아파트 시장', 'market_report', '2026-10-01T00:00:00Z');
  olderStrong.metadata.region = 'jamsil';
  assert.deepEqual(
    selectLandingReports([newerWeak, olderStrong], config).map((item) => item.slug),
    ['older-strong', 'newer-weak'],
  );
});

test('dispute breadcrumb taxonomy is shared by landing and report paths', () => {
  const dispute = reportBreadcrumbSection({ content_type: 'dispute_case' });
  assert.deepEqual(dispute, { name: '계약·분쟁 사례', path: 'disputes.html' });
  assert.equal(getReportLandingConfigByKey('dispute-cases').breadcrumbName, dispute.name);
  assert.deepEqual(reportBreadcrumbSection({ content_type: 'market_report' }), {
    name: '시장·정책', path: 'report.html',
  });
});
