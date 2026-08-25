import assert from 'node:assert/strict';
import test from 'node:test';

import { nextInquiryChatStep } from '../js/inquiryChat.js';

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
