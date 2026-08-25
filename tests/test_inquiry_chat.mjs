import assert from 'node:assert/strict';
import test from 'node:test';

import { isPersistedInquiryResult, nextInquiryChatStep, submittedChatValue } from '../js/inquiryChat.js';

test('listing inquiries ask for a listing reference while callback requests skip it', () => {
  assert.equal(nextInquiryChatStep('inquiryType', { inquiryType: 'listing' }), 'sourceChannel');
  assert.equal(
    nextInquiryChatStep('sourceChannel', { inquiryType: 'listing', sourceChannel: 'zigbang' }),
    'externalListingRef'
  );
  assert.equal(
    nextInquiryChatStep('sourceChannel', { inquiryType: 'callback', sourceChannel: 'website' }),
    'name'
  );
});

test('skip explicitly discards typed optional values', () => {
  assert.equal(submittedChatValue('typed private value', true), '');
  assert.equal(submittedChatValue('  kept value  ', false), 'kept value');
});

test('only confirmed database persistence can complete an inquiry', () => {
  assert.equal(isPersistedInquiryResult({ success: true, persisted: true }), true);
  assert.equal(isPersistedInquiryResult({ success: true, persisted: false }), false);
  assert.equal(isPersistedInquiryResult(null), false);
});
