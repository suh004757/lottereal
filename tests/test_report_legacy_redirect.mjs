import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyReportRedirectHref } from '../public/js/utils/reportUrls.mjs';

test('legacy slug moves immediately when it is in the local export manifest', () => {
  let networkCalls = 0;
  assert.equal(
    legacyReportRedirectHref(
      '?slug=2026-04-13-korea-market-report',
      new Set(['2026-04-13-korea-market-report']),
      () => { networkCalls += 1; },
    ),
    '/reports/2026-04-13-korea-market-report.html'
  );
  assert.equal(networkCalls, 0);
});

test('slug absent from the manifest keeps the dynamic report', () => {
  assert.equal(legacyReportRedirectHref('?slug=not-exported-yet', new Set()), null);
});

test('no slug or an unsafe slug is rejected locally', () => {
  const exported = new Set(['x']);
  assert.equal(legacyReportRedirectHref('', exported), null);
  assert.equal(legacyReportRedirectHref('?slug=../admin/index', exported), null);
  assert.equal(legacyReportRedirectHref('?slug=https://evil.example', exported), null);
});
