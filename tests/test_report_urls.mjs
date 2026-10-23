import assert from 'node:assert/strict';
import test from 'node:test';
import { reportStaticHref, reportStaticUrl } from '../public/js/utils/reportUrls.mjs';

assert.equal(
  reportStaticHref('2026-09-26-songpa-safe-check'),
  '/reports/2026-09-26-songpa-safe-check.html'
);
assert.equal(
  reportStaticUrl('2026-09-26-songpa-safe-check', 'https://lottes.co.kr/knowledge.html'),
  'https://lottes.co.kr/reports/2026-09-26-songpa-safe-check.html'
);
assert.equal(reportStaticHref('../escape'), '/report.html');
assert.equal(reportStaticHref(''), '/report.html');

console.log('report static URL tests passed');

test('only the legacy ?slug= view of report.html is kept out of search indexes', async () => {
  const { legacyReportRobots } = await import('../public/js/utils/reportUrls.mjs');
  assert.equal(legacyReportRobots(''), null);
  assert.equal(legacyReportRobots('?utm_source=naver'), null);
  assert.equal(legacyReportRobots('?slug=2026-10-17-jamsil-apartment-parking-check'), 'noindex,follow');
  assert.equal(legacyReportRobots('?slug='), 'noindex,follow');
});
