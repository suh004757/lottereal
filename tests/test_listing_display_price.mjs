import assert from 'node:assert/strict';
import test from 'node:test';

import { formatListingDisplayPrice } from '../public/js/utils/propertyPrice.mjs';

test('intake/admin monthly rows: price is the monthly rent, deposit in metadata', () => {
  assert.equal(
    formatListingDisplayPrice({ property_type: '월세', price: 80, metadata: { deposit: 1000, monthly_rent: 80 } }),
    '보증금 1,000만원 / 월세 80만원'
  );
  assert.equal(
    formatListingDisplayPrice({ property_type: '월세', price: 80, metadata: { deposit: 1000 } }),
    '보증금 1,000만원 / 월세 80만원'
  );
});

test('older monthly rows: price is the deposit, rent read from the description', () => {
  assert.equal(
    formatListingDisplayPrice({ property_type: '월세', price: 2000, description: '보증금 2000 월세 157만원, 쓰리룸' }),
    '보증금 2,000만원 / 월세 157만원'
  );
});

test('sale and jeonse keep the type prefix; empty rows can ask for a call', () => {
  assert.equal(formatListingDisplayPrice({ property_type: '매매', price: 65000 }), '매매 6억 5,000만원');
  assert.equal(formatListingDisplayPrice({ property_type: '전세', price: 0 }), '');
  assert.equal(formatListingDisplayPrice({ property_type: '전세', price: 0 }, { emptyLabel: true }), '전세가 문의');
  assert.equal(formatListingDisplayPrice({ property_type: '월세' }, { emptyLabel: true }), '월세 문의');
});
