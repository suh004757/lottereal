import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSanitizedReportHtml } from '../js/reportRenderSecurity.mjs';

test('public report rendering fails closed when parser or sanitizer is unavailable', () => {
  assert.throws(
    () => buildSanitizedReportHtml({ markdown: '<img onerror=alert(1)>', marked: null, purifier: null }),
    /안전 모듈/
  );
  assert.throws(
    () => buildSanitizedReportHtml({ markdown: 'body', marked: { parse: (value) => value }, purifier: null }),
    /안전 모듈/
  );
});

test('public report body can only come from the sanitizer', () => {
  const calls = [];
  const result = buildSanitizedReportHtml({
    markdown: '<img src=x onerror=alert(1)>',
    marked: { parse: (value) => `<p>${value}</p>` },
    purifier: {
      sanitize(value) {
        calls.push(value);
        return '<p>safe</p>';
      }
    }
  });
  assert.deepEqual(calls, ['<p><img src=x onerror=alert(1)></p>']);
  assert.equal(result, '<p>safe</p>');
});
