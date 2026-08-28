import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAFE_CONTACT_PHONE,
  SAFE_CONTACT_TEL,
  getPublicContactPhone
} from '../js/utils/contactPhone.mjs';

test('public contact phone is the approved safe number', () => {
  assert.equal(SAFE_CONTACT_PHONE, '0507-1402-5055');
  assert.equal(SAFE_CONTACT_TEL, 'tel:050714025055');
});

test('listing-specific phone values never override the public safe number', () => {
  assert.equal(getPublicContactPhone('02-415-8809'), SAFE_CONTACT_PHONE);
  assert.equal(getPublicContactPhone('010-1234-5678'), SAFE_CONTACT_PHONE);
  assert.equal(getPublicContactPhone(''), SAFE_CONTACT_PHONE);
  assert.equal(getPublicContactPhone(null), SAFE_CONTACT_PHONE);
});
