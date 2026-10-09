import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeInquiryMessage } from '../public/js/utils/inquiryDisplay.mjs';

test('normalizes inquiry preview whitespace without changing words', () => {
  assert.equal(
    summarizeInquiryMessage('  문의 유형: 일반 상담\n\n  Hello   world  '),
    '문의 유형: 일반 상담 Hello world'
  );
});

test('keeps short inquiry previews intact', () => {
  assert.equal(summarizeInquiryMessage('Short inquiry.'), 'Short inquiry.');
});

test('truncates long previews deterministically with one ellipsis', () => {
  const value = 'A'.repeat(260);
  const result = summarizeInquiryMessage(value);
  assert.equal(result.length, 220);
  assert.equal(result.endsWith('…'), true);
  assert.equal(result, `${'A'.repeat(219)}…`);
});

test('handles empty values safely', () => {
  assert.equal(summarizeInquiryMessage(null), '');
  assert.equal(summarizeInquiryMessage(undefined), '');
});
