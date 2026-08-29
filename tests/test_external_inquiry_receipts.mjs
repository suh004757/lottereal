import assert from 'node:assert/strict';
import { normalizeActivitySummary, normalizePublicReceipts, renderPublicReceipts } from '../js/externalInquiryReceipts.mjs';

const now = new Date('2026-08-29T05:30:00Z'); // 14:30 KST
const rows = [
  {
    source: 'zigbang',
    listing_number: '50181019',
    transaction_type: '전세',
    activity_kind: 'current',
    received_bucket: '2026-08-29T12:00:00+09:00',
    status: 'received'
  },
  {
    source: 'zigbang',
    listing_number: '50170001',
    transaction_type: '월세',
    activity_kind: 'history',
    received_bucket: '2026-07-18',
    status: 'received'
  },
  {
    source: 'zigbang',
    listing_number: '<img src=x onerror=alert(1)>',
    transaction_type: '매매',
    activity_kind: 'history',
    received_bucket: '2026-07-10',
    status: 'received'
  },
  {
    source: 'zigbang',
    listing_number: '40000000',
    transaction_type: '단기임대',
    activity_kind: 'history',
    received_bucket: '2026-06-01',
    status: 'received'
  }
];

const normalized = normalizePublicReceipts(rows, now);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].listingNumber, '50181019');
assert.equal(normalized[0].transactionType, '전세');
assert.equal(normalized[0].timeLabel, '12시');
assert.equal(normalized[0].isCurrent, true);
assert.equal(normalized[1].listingNumber, '50170001');
assert.equal(normalized[1].transactionType, '월세');
assert.equal(normalized[1].timeLabel, '2026.07.18');
assert.equal(normalized[1].isCurrent, false);

const summary = normalizeActivitySummary({ total: 27, jeonse: 12, monthly_rent: 9, sale: 6 });
assert.deepEqual(summary, { total: 27, jeonse: 12, monthlyRent: 9, sale: 6 });
assert.equal(normalizeActivitySummary({ total: -1, jeonse: 0, monthly_rent: 0, sale: 0 }), null);
assert.equal(normalizeActivitySummary({ total: 4, jeonse: 1, monthly_rent: 1, sale: 1 }), null);
assert.equal(normalizeActivitySummary({ total: null, jeonse: 0, monthly_rent: 0, sale: 0 }), null);
assert.equal(normalizeActivitySummary({ total: '', jeonse: 0, monthly_rent: 0, sale: 0 }), null);
assert.equal(normalizeActivitySummary({ total: false, jeonse: 0, monthly_rent: 0, sale: 0 }), null);

const invalidBuckets = [
  { ...rows[1], received_bucket: '2026-02-30' },
  { ...rows[1], received_bucket: '2025-08-28' },
  { ...rows[1], received_bucket: '2026-08-29' },
  { ...rows[0], received_bucket: '2026-08-29T03:00:00Z' },
  { ...rows[0], received_bucket: '2026-08-29T12:30:00+09:00' },
  { ...rows[0], received_bucket: '2026-08-28T14:00:00+09:00' }
];
for (const invalid of invalidBuckets) {
  assert.equal(normalizePublicReceipts([invalid], now).length, 0);
}
assert.equal(normalizePublicReceipts([{ ...rows[0], received_bucket: '2026-08-28T15:00:00+09:00' }], now).length, 1);
assert.equal(normalizePublicReceipts([{ ...rows[1], received_bucket: '2026-08-28' }], now).length, 1);
assert.equal(normalizePublicReceipts([{ ...rows[1], received_bucket: '2025-08-29' }], now).length, 1);

const html = renderPublicReceipts(normalized, summary);
assert.match(html, /최근 확인된 관심 문의 27건/);
assert.doesNotMatch(html, /최근 1년 관심 문의/);
assert.match(html, /전세 12/);
assert.match(html, /월세 9/);
assert.match(html, /매매 6/);
assert.match(html, /매물번호 50181019/);
assert.match(html, /12시/);
assert.match(html, /지금 관심/);
assert.match(html, /매물번호 50170001/);
assert.match(html, /2026\.07\.18/);
assert.match(html, /지난 관심 기록/);
assert.match(html, /contact\.html\?source=zigbang&amp;listing=50181019#inquiry-options/);
assert.match(html, /이 매물 문의/);
assert.doesNotMatch(html, /16300|가격|onerror|삼전동|전화|이메일|문의 내용/);

const empty = renderPublicReceipts([], { total: 0, jeonse: 0, monthlyRent: 0, sale: 0 });
assert.match(empty, /아직 공개할 수 있는 관심 기록이 없습니다/);
assert.match(empty, /찾는 매물 상담하기/);

console.log('external inquiry receipt UI tests passed');
