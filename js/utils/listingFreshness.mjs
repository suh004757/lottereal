const DAY_MS = 24 * 60 * 60 * 1000;
export const LISTING_REVIEW_AFTER_DAYS = 30;

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function verificationDate(listing = {}) {
  const candidates = [
    ['last_verified_at', listing.last_verified_at],
    ['last_verified_at', listing.metadata?.last_verified_at],
    ['created_at', listing.created_at]
  ];
  for (const [source, value] of candidates) {
    const date = parseDate(value);
    if (date) return { source, date };
  }
  return { source: null, date: null };
}

export function getListingFreshness(listing = {}, {
  now = new Date(),
  reviewAfterDays = LISTING_REVIEW_AFTER_DAYS
} = {}) {
  const current = parseDate(now) || new Date();
  const verification = verificationDate(listing);
  if (!verification.date) {
    return { needsReview: true, ageDays: null, source: null, verifiedAt: null };
  }

  const ageDays = Math.max(0, Math.floor((current.getTime() - verification.date.getTime()) / DAY_MS));
  return {
    needsReview: ageDays >= reviewAfterDays,
    ageDays,
    source: verification.source,
    verifiedAt: verification.date.toISOString()
  };
}

const COPY = {
  ko: {
    label: '거래 가능 여부 확인 필요',
    message: '등록 후 시간이 지나 현재 가격과 입주 가능 여부를 다시 확인해야 합니다. 방문 전에 전화로 확인해 주세요.',
    description: '이 페이지는 과거 등록 내용을 참고용으로 보관한 것이며, 현재 거래 가능한 매물로 확인된 상태가 아닙니다. 가격·입주일 등 최신 조건은 전화로 확인해 주세요.',
    pricePrefix: '게시 당시'
  },
  en: {
    label: 'Availability needs confirmation',
    message: 'This listing has not been recently verified. Please call before relying on the price or move-in timing.',
    description: 'This page preserves an earlier listing record for reference. It is not currently confirmed as available. Please call to verify the latest price and timing.',
    pricePrefix: 'Previously listed at'
  }
};

export function getListingFreshnessCopy(freshness, language = 'ko') {
  if (!freshness?.needsReview) return null;
  return COPY[language === 'en' ? 'en' : 'ko'];
}

export function getSafeListingDescription(listing = {}, freshness, language = 'ko') {
  const copy = getListingFreshnessCopy(freshness, language);
  if (copy) return copy.description;
  return String(listing.description || listing.summary || '');
}
