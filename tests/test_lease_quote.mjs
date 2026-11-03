import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEASE_TERMS,
  SHORTSTAY_LISTING_ID,
  buildLeaseRequestPayload,
  leaseDays,
  quoteLease,
  rangeIsOpen,
  EXTENSION_MAX_DAYS,
  isExtensionStart,
  quoteExtension
} from '../public/js/utils/leaseQuote.mjs';

const LEASED = [{ starts_on: '2026-10-30', ends_on: '2026-11-07' }];
const REQUEST = {
  startsOn: '2026-11-10',
  endsOn: '2026-11-19',
  name: ' 홍길동 ',
  phone: '010-1234-5678',
  message: '2명, 주차 필요',
  privacyConsent: true
};

test('both 입주일 and 퇴거일 are leased days', () => {
  assert.equal(leaseDays('2026-10-30', '2026-11-05'), 7);
  assert.equal(leaseDays('2026-11-05', '2026-11-05'), 1);
  assert.equal(leaseDays('2026-11-05', '2026-11-04'), 0);
});

test('a whole week costs exactly the advertised weekly rent and maintenance', () => {
  const quote = quoteLease('2026-11-10', '2026-11-16');
  assert.equal(quote.total, LEASE_TERMS.weeklyRent + LEASE_TERMS.weeklyMaintenance);
  assert.equal(quote.extraDays, 0);
});

test('days past whole weeks add the daily rate and never undercut the weekly price', () => {
  const quote = quoteLease('2026-11-10', '2026-11-19');
  assert.deepEqual([quote.weeks, quote.extraDays], [1, 3]);
  assert.equal(quote.total, 690000 + 3 * (LEASE_TERMS.dailyRent + LEASE_TERMS.dailyMaintenance));
  // Seven daily days must not cost more than one week, or 13 days would cost more than 14.
  assert.ok(7 * (LEASE_TERMS.dailyRent + LEASE_TERMS.dailyMaintenance) <= 690000);
  assert.ok(quoteLease('2026-11-01', '2026-11-13').total < quoteLease('2026-11-01', '2026-11-14').total);
});

test('new requests need at least seven days, admin extensions do not', () => {
  assert.deepEqual(quoteLease('2026-11-10', '2026-11-12'), { ok: false, reason: 'too_short', days: 3 });
  assert.equal(quoteLease('2026-11-08', '2026-11-09', { minDays: 1 }).total, 2 * 98000);
});

test('a range touching any leased day is not open', () => {
  assert.equal(rangeIsOpen(LEASED, '2026-11-07', '2026-11-14'), false);
  assert.equal(rangeIsOpen(LEASED, '2026-11-08', '2026-11-14'), true);
  assert.equal(rangeIsOpen(LEASED, '2026-10-20', '2026-11-20'), false);
});

test('the request payload satisfies the public inquiry insert policy', () => {
  const payload = buildLeaseRequestPayload(REQUEST, LEASED);
  const meta = payload.metadata;
  assert.equal(payload.listingId, SHORTSTAY_LISTING_ID);
  assert.match(payload.listingTitle, /^ST-01 /);
  assert.match(payload.phone, /^[0-9]{9,11}$/);
  assert.equal(payload.name, '홍길동');
  assert.ok(payload.listingTitle.trim() && payload.message.trim());
  assert.equal(meta.source, 'public-inquiry-mvp');
  assert.ok(['callback', 'listing', 'consultation'].includes(meta.inquiry_type));
  assert.ok(['website', 'zigbang', 'dabang', 'naver', 'walkin', 'other'].includes(meta.source_channel));
  assert.ok(['anytime', 'today-morning', 'today-afternoon', 'weekday-evening', 'tomorrow'].includes(meta.callback_time));
  assert.equal(meta.privacy_consent, true);
  assert.ok(Buffer.byteLength(JSON.stringify(meta)) <= 4000);
  assert.ok(Buffer.byteLength(payload.message) <= 4000);
  assert.deepEqual(meta.lease_request, { kind: 'new', starts_on: '2026-11-10', ends_on: '2026-11-19', days: 10, quoted_total: 984000 });
});

test('the payload is refused without consent, under seven days, or over leased days', () => {
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, privacyConsent: false }, LEASED), /동의/);
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, endsOn: '2026-11-12' }, LEASED), /최소 7일/);
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, startsOn: '2026-11-05' }, LEASED), /이미 계약/);
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, phone: '12' }, LEASED), /연락처/);
});

test('an extension starts the day after an existing lease and is capped below a week', () => {
  assert.equal(isExtensionStart(LEASED, '2026-11-08'), true);
  assert.equal(isExtensionStart(LEASED, '2026-11-09'), false);
  assert.equal(isExtensionStart(LEASED, '2026-11-07'), false);
  assert.equal(EXTENSION_MAX_DAYS, 6);
  assert.equal(quoteExtension('2026-11-08', '2026-11-10').total, 3 * (LEASE_TERMS.dailyRent + LEASE_TERMS.dailyMaintenance));
  assert.equal(quoteExtension('2026-11-08', '2026-11-10').deposit, 0);
  assert.equal(quoteExtension('2026-11-08', '2026-11-14').reason, 'too_long');
});

test('extension payload is marked as an extension and skips deposit and cleaning', () => {
  const payload = buildLeaseRequestPayload({ ...REQUEST, startsOn: '2026-11-08', endsOn: '2026-11-10', kind: 'extension' }, LEASED);
  assert.equal(payload.metadata.lease_request.kind, 'extension');
  assert.equal(payload.metadata.lease_request.days, 3);
  assert.match(payload.listingTitle, /연장 신청/);
  assert.match(payload.message, /보증금·청소비 추가 없음/);
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, startsOn: '2026-11-12', endsOn: '2026-11-13', kind: 'extension' }, LEASED), /다음 날부터/);
  assert.throws(() => buildLeaseRequestPayload({ ...REQUEST, startsOn: '2026-11-08', endsOn: '2026-11-14', kind: 'extension' }, LEASED), /6일까지/);
});

for (const page of ['songpa-short-term-rental.html', 'songpa-short-term-rental-en.html', 'songpa-short-term-rental-ja.html']) {
  test(`term example amounts on ${page} match quoteLease`, async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    const won = (text) => text.includes('만원') ? Number(text.match(/\d+/)[0]) * 10000 : Number(text.replace(/[^\d]/g, ''));
    const rows = [...html.matchAll(/<tr data-term-days="(\d+)">.*?<td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
    assert.ok(rows.length >= 2);
    for (const [, days, total, withFees] of rows) {
      const end = new Date(Date.UTC(2026, 10, 8 + Number(days) - 1)).toISOString().slice(0, 10);
      const quote = quoteLease('2026-11-08', end);
      assert.equal(quote.days, Number(days));
      assert.equal(won(total), quote.total);
      assert.equal(won(withFees), quote.total + quote.deposit + quote.cleaning);
    }
  });
}

const localizedPricingCopy = [
  {
    page: 'songpa-short-term-rental-en.html',
    fullWeek: /Each complete 7-day week is KRW 690,000/,
    remainder: /after complete weeks are counted, any remaining days are KRW 98,000 per day/,
    caveats: [/KRW 330,000 deposit is settled and returned after move-out/, /utilities are extra/],
  },
  {
    page: 'songpa-short-term-rental-ja.html',
    fullWeek: /7日間の各1週間は690,000ウォン/,
    remainder: /満1週間単位で計算した後の残りの日数は、1日あたり98,000ウォン/,
    caveats: [/保証金330,000ウォンは退去後に精算して返還/, /光熱費は別途/],
  },
];

for (const { page, fullWeek, remainder, caveats } of localizedPricingCopy) {
  test(`pricing footnote on ${page} describes whole weeks plus remainder days`, async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL(`../public/${page}`, import.meta.url), 'utf8');
    const footnote = html.match(/<table class="shortstay-cost-table" data-term-examples>[\s\S]*?<\/table>\s*<p class="shortstay-note">([^<]+)<\/p>/)?.[1] ?? '';
    assert.match(footnote, fullWeek);
    assert.match(footnote, remainder);
    for (const caveat of caveats) assert.match(footnote, caveat);
    assert.equal(LEASE_TERMS.weeklyRent + LEASE_TERMS.weeklyMaintenance, 690000);
    assert.equal(LEASE_TERMS.dailyRent + LEASE_TERMS.dailyMaintenance, 98000);
  });
}
