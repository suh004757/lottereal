import assert from 'node:assert/strict';
import { reportStaticHref, reportStaticUrl } from '../js/utils/reportUrls.mjs';

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
