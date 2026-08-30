import assert from 'node:assert/strict';
import {
  buildFamilyListingAlias,
  buildAdvertisingDraftText,
  buildQuickFamilyListingInput,
  buildOriginalListingShareText,
  groupFamilyListingPhotos,
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

const quickPost = buildQuickFamilyListingInput({
  listingTitle: '삼전 미성 301 월세',
  text: '천에 70, 방 둘이고 바로 입주. 사진 같이 올림',
  mode: 'post'
}, { now: new Date('2026-08-31T01:00:00+09:00') });
assert.equal(quickPost.neighborhood, '삼전');
assert.equal(quickPost.buildingKeyword, '미성');
assert.equal(quickPost.unitLabel, '301호');
assert.equal(quickPost.transactionType, '월세');
assert.equal(quickPost.intakeYearMonth, '2026-08');
assert.equal(quickPost.status, 'new');

const photoTask = buildQuickFamilyListingInput({
  listingTitle: '석촌 시장뒤 원룸',
  text: '외관, 현관, 화장실, 주방 사진 필요',
  mode: 'photo_task',
  visitDate: '2026-09-02'
}, { now: new Date('2026-08-31T01:00:00+09:00') });
assert.equal(photoTask.status, 'needs_info');
assert.equal(photoTask.transactionType, '기타');
assert.match(photoTask.staffTask, /9월 2일/);
assert.match(photoTask.staffTask, /외관/);
const shortStayTask = buildQuickFamilyListingInput({ listingTitle: '석촌 원룸 단기', text: '내부 전체', mode: 'photo_task' }, { now: new Date('2026-08-31T01:00:00+09:00') });
assert.equal(shortStayTask.transactionType, '임대');
assert.throws(
  () => normalizeFamilyListingInput({ ...shortStayTask, transactionType: '단기' }, { aliasCode: '석촌-원룸-호수확인-단기-2608' }),
  /거래유형을 확인/
);
const longTaskText = '가'.repeat(221);
assert.throws(
  () => buildQuickFamilyListingInput({ listingTitle: '석촌 원룸', text: longTaskText, mode: 'photo_task', visitDate: '2026-09-02' }, { now: new Date('2026-08-31T01:00:00+09:00') }),
  /220자 이내/
);

const previousTimeZone = process.env.TZ;
process.env.TZ = 'UTC';
const koreaMonthBoundary = buildQuickFamilyListingInput({
  listingTitle: '삼전 미성 302 월세',
  text: '월말 늦은 시간 접수',
  mode: 'post'
}, { now: new Date('2026-08-31T16:30:00Z') });
process.env.TZ = previousTimeZone;
assert.equal(koreaMonthBoundary.intakeYearMonth, '2026-09');

const groupedPhotos = groupFamilyListingPhotos([
  {
    id: 'batch-current',
    created_at: '2026-08-31T01:00:00Z',
    metadata: {
      family_listing_id: 'listing-a',
      photo_upload_state: 'complete',
      private_image_paths: ['user-a/batch-current/01.jpg', 'user-a/batch-current/02.jpg']
    }
  },
  {
    id: 'batch-other',
    created_at: '2026-08-30T01:00:00Z',
    metadata: {
      family_listing_id: 'listing-b',
      photo_upload_state: 'complete',
      private_image_paths: ['user-a/batch-other/01.jpg']
    }
  },
  {
    id: 'batch-pending',
    metadata: {
      family_listing_id: 'listing-a',
      photo_upload_state: 'pending',
      private_image_paths: ['user-a/batch-pending/01.jpg']
    }
  }
], new Map([
  ['user-a/batch-current/01.jpg', 'https://signed.example/01'],
  ['user-a/batch-current/02.jpg', 'https://signed.example/02'],
  ['user-a/batch-other/01.jpg', 'https://signed.example/other']
]));
assert.equal(groupedPhotos['listing-a'].length, 2);
assert.equal(groupedPhotos['listing-a'][0].batchId, 'batch-current');
assert.equal(groupedPhotos['listing-a'][0].url, 'https://signed.example/01');
assert.equal(groupedPhotos['listing-b'].length, 1);
assert.equal(groupedPhotos['batch-pending'], undefined);

const originalShare = buildOriginalListingShareText({
  neighborhood: '삼전동',
  building_keyword: '미성빌라',
  unit_label: '301호'
}, '천에 70, 방 둘. 연락은 010-1234-5678, 공동현관 2580, 국민 123-456-789012, 집주인 홍길동, mail owner@example.com, 링크 https://example.com/token?key=secret, 123-456-789');
assert.match(originalShare, /천에 70, 방 둘/);
for (const privateValue of [
  '010-1234-5678', '2580', '123-456-789012', '홍길동',
  'owner@example.com', 'https://example.com/token?key=secret', '123-456-789'
]) {
  assert.equal(originalShare.includes(privateValue), false);
}

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
