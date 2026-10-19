import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyReportRedirectHref } from '../public/js/utils/reportUrls.mjs';

function fakeFetch(okPaths) {
  const calls = [];
  const impl = async (href, options) => {
    calls.push({ href, method: options?.method });
    return { ok: okPaths.includes(href) };
  };
  return { impl, calls };
}

test('legacy slug moves to its static page when the page exists', async () => {
  const { impl, calls } = fakeFetch(['/reports/2026-04-13-korea-market-report.html']);
  assert.equal(
    await legacyReportRedirectHref('?slug=2026-04-13-korea-market-report', impl),
    '/reports/2026-04-13-korea-market-report.html'
  );
  assert.deepEqual(calls, [{ href: '/reports/2026-04-13-korea-market-report.html', method: 'HEAD' }]);
});

test('missing static page keeps the dynamic report', async () => {
  const { impl } = fakeFetch([]);
  assert.equal(await legacyReportRedirectHref('?slug=not-exported-yet', impl), null);
});

test('no slug or an unsafe slug never fetches', async () => {
  const { impl, calls } = fakeFetch(['/reports/x.html']);
  assert.equal(await legacyReportRedirectHref('', impl), null);
  assert.equal(await legacyReportRedirectHref('?slug=../admin/index', impl), null);
  assert.equal(await legacyReportRedirectHref('?slug=https://evil.example', impl), null);
  assert.equal(calls.length, 0);
});

test('network failure keeps the dynamic report', async () => {
  const failing = async () => { throw new Error('offline'); };
  assert.equal(await legacyReportRedirectHref('?slug=2026-04-13-korea-market-report', failing), null);
});
