import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSanitizedReportHtml } from '../public/js/reportRenderSecurity.mjs';

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

test('report body drops a leading markdown title already shown in the header', () => {
  const result = buildSanitizedReportHtml({
    markdown: '# 2026년 10월 17일 잠실 아파트 주차\n\n## 먼저 볼 내용\n본문',
    marked: { parse: (value) => value },
    purifier: { sanitize: (value) => value }
  });
  assert.equal(result.startsWith('## 먼저 볼 내용'), true);
  assert.equal(result.includes('# 2026년'), false);
});
