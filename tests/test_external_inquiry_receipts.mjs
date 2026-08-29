import assert from 'node:assert/strict';
import { normalizePublicReceipts, renderPublicReceipts } from '../js/externalInquiryReceipts.mjs';

const now = new Date('2026-08-29T05:30:00Z'); // 14:30 KST
const rows = [
  {
    source: 'zigbang',
    listing_number: '50181019',
    transaction_type: '전세',
    received_hour: '2026-08-29T03:00:00Z',
    expires_at: '2026-08-30T03:00:00Z',
    status: 'received'
  },
  {
    source: 'zigbang',
    listing_number: '<img src=x onerror=alert(1)>',
    received_hour: '2026-08-29T04:00:00Z',
    expires_at: '2026-08-30T04:00:00Z',
    status: 'received'
  },
  {
    source: 'zigbang',
    listing_number: '40000000',
    received_hour: '2026-08-28T03:00:00Z',
    expires_at: '2026-08-29T03:00:00Z',
    status: 'received'
  }
];

const normalized = normalizePublicReceipts(rows, now);
assert.equal(normalized.length, 1);
assert.equal(normalized[0].listingNumber, '50181019');
assert.equal(normalized[0].transactionType, '전세');
assert.equal(normalized[0].hourLabel, '12시');

const html = renderPublicReceipts(normalized);
assert.match(html, /전세/);
assert.match(html, /매물번호 50181019/);
assert.match(html, /12시/);
assert.match(html, /고객 관심 접수/);
assert.match(html, /contact\.html\?source=zigbang&amp;listing=50181019#inquiry-options/);
assert.match(html, /이 매물 문의/);
assert.match(html, /접수됨/);
assert.doesNotMatch(html, /16300|가격/);
assert.doesNotMatch(html, /onerror/);
assert.doesNotMatch(html, /삼전동|전화|이메일|문의 내용/);

const empty = renderPublicReceipts([]);
assert.match(empty, /오늘 공개 중인 관심 문의는 아직 없습니다/);
assert.match(empty, /찾는 매물 상담하기/);

console.log('external inquiry receipt UI tests passed');
