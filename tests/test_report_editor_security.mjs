import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeReportMetadata,
  buildSanitizedPreview
} from '../js/reportEditorSecurity.mjs';

test('ADMIN chat metadata is preserved and cannot be published by the report editor', () => {
  const original = {
    intake_source: 'admin-chat',
    intake_type: 'report',
    review_state: 'awaiting_discussion',
    publish_approved: false,
    submitted_by: 'owner-id',
    sensitive_flags: ['phone']
  };
  const merged = mergeReportMetadata(original, 2, '2026-08-29T00:00:00.000Z', 'draft');
  assert.deepEqual(merged, {
    ...original,
    evidenceCount: 2,
    lastEditedAt: '2026-08-29T00:00:00.000Z'
  });
  assert.throws(
    () => mergeReportMetadata(original, 2, '2026-08-29T00:00:00.000Z', 'published'),
    /ADMIN 접수 초안은 이 화면에서 공개할 수 없습니다/
  );
});

test('ordinary report metadata is merged without an ADMIN intake restriction', () => {
  assert.deepEqual(
    mergeReportMetadata({ source: 'admin-dashboard' }, 1, '2026-08-29T00:00:00.000Z', 'published'),
    { source: 'admin-dashboard', evidenceCount: 1, lastEditedAt: '2026-08-29T00:00:00.000Z' }
  );
});

test('preview fails closed when markdown parser or sanitizer is unavailable', () => {
  assert.throws(() => buildSanitizedPreview({ title: 'x', markdown: '<img onerror=alert(1)>', marked: null, purifier: null }), /안전 모듈/);
  assert.throws(() => buildSanitizedPreview({ title: 'x', markdown: 'body', marked: { parse: (v) => v }, purifier: null }), /안전 모듈/);
});

test('preview body can only come from the sanitizer and title remains plain text', () => {
  const calls = [];
  const result = buildSanitizedPreview({
    title: '<img src=x onerror=alert(1)>',
    markdown: '<img src=x onerror=alert(1)>',
    marked: { parse: (value) => `<p>${value}</p>` },
    purifier: { sanitize: (value) => { calls.push(value); return '<p>safe</p>'; } }
  });
  assert.equal(result.title, '<img src=x onerror=alert(1)>');
  assert.equal(result.bodyHtml, '<p>safe</p>');
  assert.equal(calls.length, 1);
});
