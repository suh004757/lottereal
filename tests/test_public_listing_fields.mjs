import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUBLIC_LISTING_SELECT_FIELDS,
  PUBLIC_LISTING_SELECT_QUERY
} from '../js/publicListingFields.mjs';

test('public listing projection excludes private contact and owner fields', () => {
  const forbidden = ['contact_name', 'contact_phone', 'contact_email', 'user_id'];
  for (const field of forbidden) {
    assert.equal(PUBLIC_LISTING_SELECT_FIELDS.includes(field), false, field);
    assert.equal(PUBLIC_LISTING_SELECT_QUERY.split(',').includes(field), false, field);
  }
});

test('public listing projection keeps every field required by public cards and details', () => {
  const required = [
    'id',
    'title',
    'description',
    'price',
    'currency',
    'property_type',
    'address',
    'city',
    'district',
    'latitude',
    'longitude',
    'images',
    'created_at'
  ];
  assert.deepEqual(PUBLIC_LISTING_SELECT_FIELDS, required);
  assert.equal(PUBLIC_LISTING_SELECT_QUERY, required.join(','));
});
