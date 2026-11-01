// Pricing and request payload for the Bangi-dong short-term lease. Pure, so the
// public request form, the admin panel and the tests all share one calculation.
// Dates are inclusive: 입주일 and 퇴거일 are both leased days, matching
// listing_unavailable_periods (the next tenant can move in the day after 퇴거일).
import { isDayBlocked, toDayNumber } from './shortStayAvailability.mjs';

export const SHORTSTAY_LISTING_ID = '3c04f5dd-dcb3-46ca-9332-e7cde6f9b421';

export const LEASE_TERMS = Object.freeze({
  weeklyRent: 590000,
  weeklyMaintenance: 100000,
  // Days beyond whole weeks are charged pro rata, rounded to the nearest 1,000원.
  dailyRent: 84000,
  dailyMaintenance: 14000,
  deposit: 330000,
  cleaning: 200000,
  minDays: 7
});

export function leaseDays(startsOn, endsOn) {
  const start = toDayNumber(startsOn);
  const end = toDayNumber(endsOn);
  if (start === null || end === null || end < start) return 0;
  return end - start + 1;
}

// minDays is 7 for new requests; the admin panel passes 1 to price extensions.
export function quoteLease(startsOn, endsOn, { minDays = LEASE_TERMS.minDays } = {}) {
  const days = leaseDays(startsOn, endsOn);
  if (!days) return { ok: false, reason: 'invalid' };
  if (days < minDays) return { ok: false, reason: 'too_short', days };
  const weeks = Math.floor(days / 7);
  const extraDays = days % 7;
  const rent = weeks * LEASE_TERMS.weeklyRent + extraDays * LEASE_TERMS.dailyRent;
  const maintenance = weeks * LEASE_TERMS.weeklyMaintenance + extraDays * LEASE_TERMS.dailyMaintenance;
  return {
    ok: true,
    days,
    weeks,
    extraDays,
    rent,
    maintenance,
    total: rent + maintenance,
    deposit: LEASE_TERMS.deposit,
    cleaning: LEASE_TERMS.cleaning
  };
}

export function rangeIsOpen(periods, startsOn, endsOn) {
  const start = toDayNumber(startsOn);
  const end = toDayNumber(endsOn);
  if (start === null || end === null || end < start) return false;
  for (let day = start; day <= end; day += 1) {
    if (isDayBlocked(day, periods)) return false;
  }
  return true;
}

export function formatWon(amount) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function describeQuote(quote) {
  const span = [quote.weeks ? `${quote.weeks}주` : '', quote.extraDays ? `${quote.extraDays}일` : ''].filter(Boolean).join(' ');
  return `${quote.days}일(${span}) 임대료 ${formatWon(quote.rent)} + 관리비 ${formatWon(quote.maintenance)} = ${formatWon(quote.total)}`;
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

// Builds a row for the existing inquiries table. The shape must satisfy the
// inquiries_public_insert policy (inquiry_type, source_channel, callback_time,
// privacy_consent, 9-11 digit phone), so no new table or policy is needed.
export function buildLeaseRequestPayload({ startsOn, endsOn, name, phone, message, privacyConsent }, periods = []) {
  if (privacyConsent !== true) throw new Error('연락처 수집 동의에 체크해 주세요.');
  const quote = quoteLease(startsOn, endsOn);
  if (!quote.ok) {
    throw new Error(quote.reason === 'too_short' ? '최소 7일부터 신청할 수 있습니다.' : '입주일과 퇴거일을 확인해 주세요.');
  }
  if (!rangeIsOpen(periods, startsOn, endsOn)) throw new Error('선택한 기간에 이미 계약된 날짜가 있습니다.');
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 11) throw new Error('연락처를 확인해 주세요.');
  const note = cleanText(message, 800);

  return {
    listingId: SHORTSTAY_LISTING_ID,
    listingTitle: `방이동 단기임대 입주 신청 ${startsOn}~${endsOn} (${quote.days}일)`,
    name: cleanText(name, 80),
    phone: digits,
    email: '',
    message: [
      '문의 유형: 단기임대 입주 신청',
      `기간: ${startsOn} 입주 ~ ${endsOn} 퇴거 (${quote.days}일)`,
      `예상 금액: ${describeQuote(quote)}`,
      `별도: 보증금 ${formatWon(quote.deposit)}, 퇴거 청소비 ${formatWon(quote.cleaning)}, 공과금`,
      note ? `요청사항: ${note}` : ''
    ].filter(Boolean).join('\n'),
    metadata: {
      source: 'public-inquiry-mvp',
      inquiry_type: 'listing',
      source_channel: 'website',
      callback_time: 'anytime',
      privacy_consent: true,
      locale: 'ko',
      entry_surface: 'shortstay-lease-request',
      lease_request: { starts_on: startsOn, ends_on: endsOn, days: quote.days, quoted_total: quote.total }
    }
  };
}
