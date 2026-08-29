import assert from 'node:assert/strict';
import {
  buildAdminIntakePayload,
  detectSensitiveDetails
} from '../js/adminIntake.mjs';

const now = new Date('2026-08-29T00:00:00.000Z');
const listing = buildAdminIntakePayload({
  type: 'listing',
  text: '삼전동 원룸 월세 보증금 1천만원, 월 70만원입니다. 즉시 입주 가능합니다.',
  region: '삼전동',
  transactionType: '월세'
}, { now, nonce: 'abc123' });

assert.equal(listing.status, 'draft');
assert.equal(listing.metadata.intake_source, 'admin-chat');
assert.equal(listing.metadata.intake_type, 'listing');
assert.equal(listing.metadata.review_state, 'awaiting_discussion');
assert.equal(listing.metadata.publish_approved, false);
assert.equal(listing.metadata.region, '삼전동');
assert.equal(listing.metadata.transaction_type, '월세');
assert.match(listing.slug, /^admin-intake-listing-/);
assert.match(listing.title, /^\[검토 대기\] 매물 초안/);
assert.match(listing.report_md, /삼전동 원룸/);

const report = buildAdminIntakePayload({
  type: 'report',
  text: '잠실 전세대출 금리 변화가 세입자에게 어떤 영향을 주는지 공식 자료로 설명해 주세요.',
  region: '잠실',
  sources: 'https://www.bok.or.kr\nhttps://www.reb.or.kr'
}, { now, nonce: 'def456' });
assert.equal(report.status, 'draft');
assert.equal(report.metadata.intake_type, 'report');
assert.deepEqual(report.metadata.source_urls, [
  'https://www.bok.or.kr/',
  'https://www.reb.or.kr/'
]);

assert.throws(
  () => buildAdminIntakePayload({ type: 'unknown', text: '이 입력은 무엇인지 알 수 없습니다.' }),
  /글 작성.*매물 등록/
);
assert.throws(
  () => buildAdminIntakePayload({ type: 'listing', text: '짧음' }),
  /10자/
);

const flags = detectSensitiveDetails('101동 1203호 공동현관 비밀번호 1234, 연락처 010-1234-5678');
assert.deepEqual(flags.sort(), ['access_code', 'phone', 'unit_number']);
assert.equal(JSON.stringify(listing.metadata).includes('010'), false);

console.log('admin intake payload tests passed');
