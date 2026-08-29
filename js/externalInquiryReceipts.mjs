const SOURCE_LABELS = Object.freeze({ zigbang: '직방' });
const TRANSACTION_TYPES = Object.freeze(['전세', '월세', '매매']);

export function normalizeActivitySummary(value) {
  if (!value || typeof value !== 'object') return null;
  const total = value.total;
  const jeonse = value.jeonse;
  const monthlyRent = value.monthly_rent;
  const sale = value.sale;
  const values = [total, jeonse, monthlyRent, sale];
  if (!values.every((count) => Number.isInteger(count) && count >= 0)) return null;
  if (total !== jeonse + monthlyRent + sale) return null;
  return { total, jeonse, monthlyRent, sale };
}

export function normalizePublicReceipts(rows = [], now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(rows)) return [];

  return rows
    .map((row) => normalizeRow(row, nowMs))
    .filter(Boolean)
    .sort((left, right) => right.receivedAtMs - left.receivedAtMs)
    .slice(0, 12);
}

export function renderPublicReceipts(receipts = [], summary = null) {
  const safeSummary = normalizeRenderedSummary(summary);
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return `
      <div class="lr-receipt-empty">
        <strong>아직 공개할 수 있는 관심 기록이 없습니다.</strong>
        <span>찾으시는 지역과 조건을 알려주시면 맞는 매물을 함께 찾아드립니다.</span>
        <a href="contact.html#inquiry-options">찾는 매물 상담하기</a>
      </div>
    `;
  }

  const summaryHtml = safeSummary ? `
    <div class="lr-activity-summary" aria-label="최근 1년 문의 유형별 현황">
      <strong>최근 1년 관심 문의 ${safeSummary.total}건</strong>
      <span>전세 ${safeSummary.jeonse}</span>
      <span>월세 ${safeSummary.monthlyRent}</span>
      <span>매매 ${safeSummary.sale}</span>
    </div>
  ` : '';

  const cardsHtml = receipts.map((receipt) => `
    <article class="lr-receipt-row">
      <div class="lr-receipt-main">
        <div class="lr-receipt-tags">
          <span class="lr-receipt-platform">${escapeHtml(receipt.sourceLabel)}</span>
          <span class="lr-receipt-type">${escapeHtml(receipt.transactionType)}</span>
          <span class="lr-receipt-age${receipt.isCurrent ? ' is-current' : ''}">${receipt.isCurrent ? '지금 관심' : '지난 관심 기록'}</span>
        </div>
        <strong>매물번호 ${escapeHtml(receipt.listingNumber)}</strong>
        <span class="lr-receipt-time">${escapeHtml(receipt.timeLabel)} 고객 관심 접수</span>
      </div>
      <div class="lr-receipt-actions">
        <span class="lr-receipt-status">접수됨</span>
        <a class="lr-receipt-inquire" data-listing-reference-inquiry href="contact.html?source=zigbang&amp;listing=${encodeURIComponent(receipt.listingNumber)}#inquiry-options">이 매물 문의</a>
      </div>
    </article>
  `).join('');

  return `${summaryHtml}<div class="lr-activity-list">${cardsHtml}</div>`;
}

function normalizeRow(row, nowMs) {
  if (!row || row.source !== 'zigbang' || row.status !== 'received') return null;
  const listingNumber = String(row.listing_number || '');
  const transactionType = String(row.transaction_type || '');
  const activityKind = String(row.activity_kind || '');
  const receivedBucket = String(row.received_bucket || '');
  if (!/^[0-9]{5,20}$/.test(listingNumber)) return null;
  if (!TRANSACTION_TYPES.includes(transactionType)) return null;

  if (activityKind === 'current') {
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00:00\+09:00$/.test(receivedBucket)) return null;
    if (!isValidCalendarDate(receivedBucket.slice(0, 10))) return null;
    const receivedAtMs = Date.parse(receivedBucket);
    if (!Number.isFinite(receivedAtMs)) return null;
    if (receivedAtMs > nowMs + 5 * 60 * 1000 || receivedAtMs < nowMs - 24 * 60 * 60 * 1000) return null;
    return {
      sourceLabel: SOURCE_LABELS[row.source],
      listingNumber,
      transactionType,
      receivedAtMs,
      timeLabel: formatSeoulHour(receivedAtMs),
      isCurrent: true
    };
  }

  if (activityKind !== 'history' || !/^\d{4}-\d{2}-\d{2}$/.test(receivedBucket)) return null;
  if (!isValidCalendarDate(receivedBucket)) return null;
  const receivedAtMs = Date.parse(`${receivedBucket}T00:00:00+09:00`);
  const earliestHistoryDate = formatSeoulDate(nowMs - 365 * 24 * 60 * 60 * 1000);
  const latestHistoryDate = formatSeoulDate(nowMs - 24 * 60 * 60 * 1000);
  if (
    !Number.isFinite(receivedAtMs)
    || receivedBucket < earliestHistoryDate
    || receivedBucket > latestHistoryDate
  ) return null;
  return {
    sourceLabel: SOURCE_LABELS[row.source],
    listingNumber,
    transactionType,
    receivedAtMs,
    timeLabel: receivedBucket.replaceAll('-', '.'),
    isCurrent: false
  };
}

function normalizeRenderedSummary(value) {
  if (!value || typeof value !== 'object') return null;
  const candidate = {
    total: value.total,
    jeonse: value.jeonse,
    monthlyRent: value.monthlyRent,
    sale: value.sale
  };
  const counts = Object.values(candidate);
  if (!counts.every((count) => Number.isInteger(count) && count >= 0)) return null;
  if (candidate.total !== candidate.jeonse + candidate.monthlyRent + candidate.sale) return null;
  return candidate;
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function formatSeoulDate(timestamp) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatSeoulHour(timestamp) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false
  });
  const hour = formatter.formatToParts(new Date(timestamp)).find((part) => part.type === 'hour')?.value;
  return `${Number(hour)}시`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
