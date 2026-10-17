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

  const sorted = rows
    .map((row) => normalizeRow(row, nowMs))
    .filter(Boolean)
    .sort((left, right) => right.receivedAtMs - left.receivedAtMs);

  // Cap by distinct listings, not raw rows: twelve repeats of one listing must not
  // push every other listing out. Repeats of a kept listing stay so its count is right.
  const kept = [];
  const listings = new Set();
  for (const receipt of sorted) {
    const key = listingKey(receipt);
    if (!listings.has(key)) {
      if (listings.size >= MAX_LISTINGS) continue;
      listings.add(key);
    }
    kept.push(receipt);
  }
  return kept;
}

const MAX_LISTINGS = 12;

function listingKey(receipt) {
  return `${receipt.listingNumber}|${receipt.transactionType}`;
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

  const summaryHtml = safeSummary ? renderSummary(safeSummary) : '';
  const current = receipts.filter((receipt) => receipt.isCurrent);
  const history = receipts.filter((receipt) => !receipt.isCurrent);
  const groups = [
    renderGroup('지금 관심', '최근 24시간, 1시간 단위', current, current.length),
    renderGroup('지난 관심 기록', '접수 날짜 기준', history, HISTORY_VISIBLE)
  ].join('');

  return `${summaryHtml}<div class="lr-activity-list">${groups}</div>`;
}

const HISTORY_VISIBLE = 6;

function renderSummary(summary) {
  const parts = [
    ['월세', summary.monthlyRent, 'is-monthly'],
    ['전세', summary.jeonse, 'is-jeonse'],
    ['매매', summary.sale, 'is-sale']
  ];
  const bar = summary.total > 0
    ? `<div class="lr-activity-split" aria-hidden="true">${parts
      .filter(([, count]) => count > 0)
      .map(([, count, cls]) => `<i class="${cls}" style="flex-grow:${count}"></i>`)
      .join('')}</div>`
    : '';
  return `
    <div class="lr-activity-summary" aria-label="문의 유형별 현황">
      <p><strong>최근 확인된 관심 문의 ${summary.total}건</strong><span>직방 문의 기준</span></p>
      ${bar}
      <ul class="lr-activity-legend">${parts
        .map(([label, count, cls]) => `<li class="${cls}">${label} ${count}</li>`)
        .join('')}</ul>
    </div>
  `;
}

function renderGroup(title, note, receipts, visible) {
  if (receipts.length === 0) return '';
  const rows = groupByListing(receipts).map(renderRow);
  const shown = rows.slice(0, visible).join('');
  const rest = rows.slice(visible);
  const more = rest.length
    ? `<details class="lr-activity-more"><summary>지난 기록 ${rest.length}건 더 보기</summary><ol class="lr-activity-rows">${rest.join('')}</ol></details>`
    : '';
  return `
    <section class="lr-activity-group">
      <h3>${title}<span>${note}</span></h3>
      <ol class="lr-activity-rows">${shown}</ol>
      ${more}
    </section>
  `;
}

// Repeat interest in one listing reads as one row with a count, newest date first
function groupByListing(receipts) {
  const byKey = new Map();
  for (const receipt of receipts) {
    const key = listingKey(receipt);
    const seen = byKey.get(key);
    if (seen) seen.count += 1;
    else byKey.set(key, { ...receipt, count: 1 });
  }
  return [...byKey.values()];
}

function renderRow(receipt) {
  const count = receipt.count > 1 ? `<span class="lr-receipt-count">관심 ${receipt.count}회</span>` : '';
  return `
    <li class="lr-receipt-row${receipt.isCurrent ? ' is-current' : ''}">
      <span class="lr-receipt-time">${escapeHtml(receipt.timeLabel)}</span>
      <span class="lr-receipt-type">${escapeHtml(receipt.transactionType)}</span>
      <strong>매물번호 ${escapeHtml(receipt.listingNumber)}${count}</strong>
      <a class="lr-receipt-inquire" data-listing-reference-inquiry href="contact.html?source=zigbang&amp;listing=${encodeURIComponent(receipt.listingNumber)}#inquiry-options">이 매물 문의</a>
    </li>
  `;
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
