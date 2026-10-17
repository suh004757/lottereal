export function formatManwonAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';

  const rounded = Math.round(amount);
  if (rounded < 10000) return `${rounded.toLocaleString()}만원`;

  const eok = Math.floor(rounded / 10000);
  const remainder = rounded % 10000;
  return remainder
    ? `${eok.toLocaleString()}억 ${remainder.toLocaleString()}만원`
    : `${eok.toLocaleString()}억`;
}

export function formatListingPrice(value, propertyType = '') {
  const amount = formatManwonAmount(value);
  if (!amount) return '';
  const type = String(propertyType || '').trim();
  if (type.includes('매매')) return `매매 ${amount}`;
  if (type.includes('전세')) return `전세 ${amount}`;
  return amount;
}

const EMPTY_LABELS = Object.freeze({ 월세: '월세 문의', 전세: '전세가 문의', 매매: '매매가 문의' });

function toAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function parseMonthlyRent(text) {
  const match = String(text || '').match(/월세\s*([0-9,]+)\s*만원?/);
  return match ? toAmount(match[1]) : 0;
}

/**
 * One price line for a listing, shared by the list card and the detail page.
 * 월세 rows come in two shapes:
 * - intake/admin: price = 월세, metadata.deposit (+ metadata.monthly_rent)
 * - older rows: price = 보증금, 월세 only written in the description
 */
export function formatListingDisplayPrice(listing = {}, { emptyLabel = false } = {}) {
  const type = String(listing.property_type || listing.type || '').trim();
  const price = toAmount(listing.price);
  const metadata = listing.metadata || {};

  if (type.includes('월세') || type === 'Monthly Rent') {
    const knownDeposit = toAmount(listing.deposit ?? metadata.deposit);
    const knownMonthly = toAmount(listing.monthly_rent ?? metadata.monthly_rent ?? metadata.monthlyRent);
    const deposit = knownDeposit || price;
    const monthly = knownDeposit
      ? knownMonthly || price
      : knownMonthly || parseMonthlyRent(listing.description);
    if (deposit && monthly) return `보증금 ${formatManwonAmount(deposit)} / 월세 ${monthly.toLocaleString()}만원`;
    if (monthly) return `월세 ${monthly.toLocaleString()}만원`;
    return emptyLabel ? EMPTY_LABELS.월세 : '';
  }

  if (price) return formatListingPrice(price, type);
  if (!emptyLabel) return '';
  if (type.includes('전세')) return EMPTY_LABELS.전세;
  if (type.includes('매매')) return EMPTY_LABELS.매매;
  return '가격 문의';
}
