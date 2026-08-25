import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INQUIRY_FOCUSABLE_SELECTOR,
  isPersistedInquiryResult,
  nextInquiryChatStep,
  shouldAutofocusInquiryControl,
  submittedChatValue
} from '../js/inquiryChat.js';

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

test('touch inquiry choices do not autofocus the next control', () => {
  assert.equal(shouldAutofocusInquiryControl({ historyLength: 2, modality: 'pointer' }), false);
  assert.equal(shouldAutofocusInquiryControl({ historyLength: 2, modality: 'keyboard' }), true);
  assert.equal(shouldAutofocusInquiryControl({ historyLength: 0, modality: 'keyboard' }), false);
});

test('autofocus selector excludes the hidden review honeypot', () => {
  assert.match(INQUIRY_FOCUSABLE_SELECTOR, /not\(\.lr-inquiry-chat__honeypot\)/);
  assert.match(INQUIRY_FOCUSABLE_SELECTOR, /not\(\[aria-hidden="true"\]\)/);
  assert.match(INQUIRY_FOCUSABLE_SELECTOR, /not\(\[tabindex="-1"\]\)/);
  assert.match(INQUIRY_FOCUSABLE_SELECTOR, /not\(\[disabled\]\)/);
  assert.match(INQUIRY_FOCUSABLE_SELECTOR, /\[data-chat-restart\]/);
});
