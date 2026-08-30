import assert from 'node:assert/strict';
import {
  buildFamilyListingAlias,
  buildAdvertisingDraftText,
  buildStaffShareText,
  buildFamilyParseReview,
  finalizeFamilyParseReview,
  describeIntakeYearMonth,
  ensureUniqueFamilyAlias,
  filterFamilyListings,
  normalizeFamilyListingInput,
  statusLabel
} from '../js/familyListing.mjs';

const alias = buildFamilyListingAlias({
  neighborhood: '삼전동',
  buildingKeyword: '미성 빌라',
  unitLabel: '301호',
  transactionType: '월세',
  intakeYearMonth: '2026-08'
});

assert.equal(alias, '삼전-미성빌라-301-월세-2608');
assert.deepEqual(describeIntakeYearMonth('2026-08'), {
  code: '2608',
  label: '2026년 8월 접수'
});

assert.equal(
  ensureUniqueFamilyAlias(alias, [alias, `${alias}-2`]),
  `${alias}-3`
);

const staffText = buildStaffShareText({
  alias_code: alias,
  neighborhood: '삼전동',
  building_keyword: '미성빌라',
  unit_label: '301호',
  transaction_type: '월세',
  status: 'advertising',
  assigned_to: '사장님',
  price_summary: '보증금 1,000 / 월 70 · 계좌번호 123-456-789',
  floor_summary: '3층 · 문의 02-123-4567',
  layout_summary: '방 2 / 욕실 1',
  move_in_summary: '즉시 가능 · 비밀번호는 1234',
  staff_task: '주차 확인 후 010-9876-5432로 연락, 공동현관 종5678 확인',
  internal_notes: '집주인 협의 하한 65만원',
  owner_name: '홍길동',
  owner_phone: '010-1234-5678',
  access_code: '1234',
  commission_notes: '가족 내부 정산'
});

assert.match(staffText, /^\[삼전-미성빌라-301-월세-2608\]/);
assert.match(staffText, /삼전동 미성빌라 301호/);
assert.match(staffText, /보증금 1,000 \/ 월 70/);
assert.match(staffText, /현재 상태: 광고 중/);
assert.match(staffText, /담당: 사장님/);
assert.match(staffText, /주차 확인/);
assert.match(staffText, /\[연락처 제외\]/);
assert.match(staffText, /공동현관 \[제외\]/);
assert.match(staffText, /비밀번호 \[제외\]/);
assert.match(staffText, /계좌번호 \[제외\]/);
for (const privateValue of [
  '홍길동', '010-1234-5678', '010-9876-5432', '02-123-4567',
  '123-456-789', '1234', '5678', '65만원', '가족 내부 정산'
]) {
  assert.equal(staffText.includes(privateValue), false);
}

const advertisingText = buildAdvertisingDraftText({
  alias_code: alias,
  neighborhood: '삼전동',
  building_keyword: '미성빌라',
  unit_label: '301호',
  transaction_type: '월세',
  price_summary: '보증금 1,000 / 월 70',
  floor_summary: '3층',
  layout_summary: '방 2 / 욕실 1',
  move_in_summary: '즉시 가능',
  assigned_to: '준혁',
  staff_task: '공동현관 2580',
  internal_notes: '집주인 010-1234-5678 · 세대 비밀번호 1234'
});
assert.match(advertisingText, /삼전동/);
assert.match(advertisingText, /보증금 1,000 \/ 월 70/);
for (const privateValue of ['준혁', '2580', '010-1234-5678', '1234']) {
  assert.equal(advertisingText.includes(privateValue), false);
}

const variantStaffText = buildStaffShareText({
  alias_code: alias,
  staff_task: '+82 10-1234-5678, (010) 2222-3333, (02) 444-5555, 외국인번호 900101-5123456, 국민 123456-78-901234, 입금은 111-222-333333, 현관 번호 2580, 공동현관 25 80, access code 2468, access number 1357, door code #3690*, door lock 8642, 출입 비밀 번호 9753, 계좌 번호 123-456-789, account 987654321012'
});
for (const privateValue of [
  '+82 10-1234-5678', '(010) 2222-3333', '(02) 444-5555', '900101-5123456',
  '123456-78-901234', '111-222-333333', '2580', '25 80', '2468', '1357', '3690', '8642', '9753', '987654321012'
]) {
  assert.equal(variantStaffText.includes(privateValue), false);
}
const boundaryStaffText = buildStaffShareText({
  alias_code: alias,
  staff_task: `${'x'.repeat(230)} 900101-5123456`
});
assert.equal(boundaryStaffText.includes('900101-'), false);

const normalized = normalizeFamilyListingInput({
  neighborhood: ' 삼전동 ',
  buildingKeyword: '미성 빌라',
  unitLabel: '301호',
  transactionType: '월세',
  intakeYearMonth: '2026-08',
  status: 'advertising',
  priceSummary: '보증금 1,000 / 월 70',
  internalNotes: '가족만 보는 메모'
}, { aliasCode: alias });
assert.equal(normalized.alias_code, alias);
assert.equal(normalized.neighborhood, '삼전동');
assert.equal(normalized.status, 'advertising');
assert.equal(statusLabel('advertising'), '광고 중');
assert.throws(
  () => normalizeFamilyListingInput({ ...normalized, status: 'published' }, { aliasCode: alias }),
  /상태/
);

const filtered = filterFamilyListings([
  normalized,
  { ...normalized, id: '2', alias_code: '석촌-시장뒤-202-전세-2608', neighborhood: '석촌동', status: 'visit' }
], { query: '미성 301', status: 'advertising' });
assert.deepEqual(filtered.map((item) => item.alias_code), [alias]);

const sourceText = '삼전 미성 301 월세 천에 70 주차 확인';
const existingRecord = {
  neighborhood: '삼전동',
  building_keyword: '미성빌라',
  unit_label: '301호',
  price_summary: '보증금 1,000 / 월 65'
};
const reviewDraft = buildFamilyParseReview({
  sourceText,
  existingRecord,
  suggestions: {
    neighborhood: { value: '삼전동', confidence: 0.98 },
    building_keyword: { value: '미성', confidence: 0.55 },
    unit_label: { value: '', confidence: 0.92 },
    price_summary: { value: '보증금 1,000 / 월 70', confidence: 0.9 },
    unknown_model_field: { value: '무시', confidence: 1 }
  }
});
assert.equal(reviewDraft.source_text, sourceText);
assert.equal(reviewDraft.parse_status, 'draft');
assert.deepEqual(reviewDraft.fields.neighborhood, {
  existing_value: '삼전동', suggested_value: '삼전동', value: '삼전동', status: 'suggested', confidence: 0.98
});
assert.equal(reviewDraft.fields.unit_label.value, '301호');
assert.equal(reviewDraft.fields.unit_label.status, 'kept_existing');
assert.equal(reviewDraft.fields.price_summary.value, '보증금 1,000 / 월 65');
assert.equal(reviewDraft.fields.price_summary.suggested_value, '보증금 1,000 / 월 70');
assert.equal(reviewDraft.fields.price_summary.status, 'needs_review');
assert.equal(reviewDraft.fields.building_keyword.status, 'needs_review');
assert.equal(Object.hasOwn(reviewDraft.fields, 'unknown_model_field'), false);
assert.equal(existingRecord.price_summary, '보증금 1,000 / 월 65');
assert.throws(
  () => finalizeFamilyParseReview(reviewDraft, {}),
  /확인이 필요한 항목/
);
const reviewed = finalizeFamilyParseReview(reviewDraft, {
  building_keyword: { choice: 'custom', value: '미성빌라' },
  price_summary: { choice: 'suggested' }
});
assert.equal(reviewed.parse_status, 'reviewed');
assert.equal(reviewed.source_text, sourceText);
assert.equal(reviewed.reviewed_values.building_keyword, '미성빌라');
assert.equal(reviewed.reviewed_values.price_summary, '보증금 1,000 / 월 70');
assert.equal(reviewed.reviewed_values.unit_label, '301호');
assert.equal(existingRecord.price_summary, '보증금 1,000 / 월 65');

console.log('family listing behavior tests passed');
