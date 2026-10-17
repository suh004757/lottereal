import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminListingPayload, mapListingPayloadToDatabase } from '../public/js/utils/adminListingPayload.mjs';
import { PUBLIC_LISTING_SELECT_FIELDS } from '../public/js/publicListingFields.mjs';
import { formatListingDisplayPrice } from '../public/js/utils/propertyPrice.mjs';
import { createRequestGeneration } from '../public/js/utils/requestGeneration.mjs';
import {
  assertSupabasePrivilegedProvider,
  getPublicListingFromSupabase,
  listPublicListingsFromSupabase
} from '../public/js/services/publicListingRepository.mjs';

function projectPublic(row) {
  return Object.fromEntries(PUBLIC_LISTING_SELECT_FIELDS.map((field) => [field, row[field]]));
}

test('monthly rent survives admin form mapping, database mapping, public projection and formatting', () => {
  const payload = buildAdminListingPayload({
    title: '잠실 월세', transactionType: '월세', price: '95', deposit: '3000',
    address: '서울 송파구', city: '서울', district: '송파구', description: '신규 매물'
  }, ['https://example.com/photo.jpg']);
  assert.equal(payload.deposit, 3000);
  assert.equal(payload.monthlyRent, 95);

  const dbRow = mapListingPayloadToDatabase(payload);
  assert.equal(dbRow.deposit, 3000);
  assert.equal(dbRow.monthly_rent, 95);

  const publicRow = projectPublic({ id: 'listing-1', ...dbRow });
  assert.equal(formatListingDisplayPrice(publicRow), '보증금 3,000만원 / 월세 95만원');
});

test('edit mapping preserves explicit zero/null semantics without inventing metadata rent', () => {
  const payload = buildAdminListingPayload({ transactionType: '전세', price: '50000', deposit: '' }, []);
  const row = mapListingPayloadToDatabase(payload);
  assert.equal(row.price, 50000);
  assert.equal(row.deposit, null);
  assert.equal(row.monthly_rent, null);
});

test('legacy monthly rows still read rent from the description', () => {
  assert.equal(
    formatListingDisplayPrice({ property_type: '월세', price: 2000, description: '보증금 2000 월세 157만원' }),
    '보증금 2,000만원 / 월세 157만원'
  );
});

test('editing a legacy monthly row does not reinterpret its deposit price as monthly rent', () => {
  const payload = buildAdminListingPayload({
    transactionType: '월세', price: '2000', deposit: '', monthlyRent: '',
    description: '보증금 2000 월세 157만원'
  }, []);
  assert.equal(payload.monthlyRent, null);
  const row = mapListingPayloadToDatabase(payload);
  assert.equal(formatListingDisplayPrice(row), '보증금 2,000만원 / 월세 157만원');
});

test('request generation accepts only the newest search completion', () => {
  const requests = createRequestGeneration();
  const first = requests.begin();
  const second = requests.begin();
  assert.equal(requests.isCurrent(first), false);
  assert.equal(requests.isCurrent(second), true);
  requests.invalidate();
  assert.equal(requests.isCurrent(second), false);
});

test('listing repository throws query failures, distinguishes not-found, and privileged mocks fail closed', async () => {
  let listResult = { data: [], error: null };
  let detailResult = { data: null, error: null };
  const query = () => {
    const chain = {
      select: () => chain, order: () => chain, range: () => chain, or: () => chain,
      eq: () => chain, ilike: () => chain, gte: () => chain, lte: () => chain,
      maybeSingle: async () => detailResult,
      then: (resolve, reject) => Promise.resolve(listResult).then(resolve, reject)
    };
    return chain;
  };
  const supabase = { from: query };

  listResult = { data: null, error: new Error('list unavailable') };
  await assert.rejects(() => listPublicListingsFromSupabase(supabase, 'id'), /list unavailable/);

  detailResult = { data: null, error: null };
  assert.equal(await getPublicListingFromSupabase(supabase, 'id', 'missing'), null);
  detailResult = { data: null, error: new Error('detail unavailable') };
  await assert.rejects(() => getPublicListingFromSupabase(supabase, 'id', 'broken'), /detail unavailable/);

  assert.throws(() => assertSupabasePrivilegedProvider('mock'), /Supabase/);
  assert.throws(() => assertSupabasePrivilegedProvider('api'), /Supabase/);
});
