const SOURCE_LABELS = Object.freeze({ zigbang: '직방' });

export function normalizePublicReceipts(rows = [], now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs) || !Array.isArray(rows)) return [];

  return rows
    .map((row) => normalizeRow(row, nowMs))
    .filter(Boolean)
    .sort((left, right) => right.receivedAtMs - left.receivedAtMs)
    .slice(0, 8);
}

export function renderPublicReceipts(receipts = []) {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return `
      <div class="lr-receipt-empty">
        <strong>오늘 공개 중인 관심 문의는 아직 없습니다.</strong>
        <span>찾으시는 지역과 조건을 알려주시면 맞는 매물을 함께 찾아드립니다.</span>
        <a href="contact.html#inquiry-options">찾는 매물 상담하기</a>
      </div>
    `;
  }
  return receipts.map((receipt) => `
    <article class="lr-receipt-row">
      <div class="lr-receipt-main">
        <div class="lr-receipt-tags">
          <span class="lr-receipt-platform">${escapeHtml(receipt.sourceLabel)}</span>
          <span class="lr-receipt-type">${escapeHtml(receipt.transactionType)}</span>
        </div>
        <strong>매물번호 ${escapeHtml(receipt.listingNumber)}</strong>
        <span class="lr-receipt-time">${escapeHtml(receipt.hourLabel)} 고객 관심 접수</span>
      </div>
      <div class="lr-receipt-actions">
        <span class="lr-receipt-status">접수됨</span>
        <a class="lr-receipt-inquire" data-listing-reference-inquiry href="contact.html?source=zigbang&amp;listing=${encodeURIComponent(receipt.listingNumber)}#inquiry-options">이 매물 문의</a>
      </div>
    </article>
  `).join('');
}

function normalizeRow(row, nowMs) {
  if (!row || row.source !== 'zigbang' || row.status !== 'received') return null;
  const listingNumber = String(row.listing_number || '');
  const transactionType = String(row.transaction_type || '');
  if (!/^[0-9]{5,20}$/.test(listingNumber)) return null;
  if (!['전세', '월세', '매매'].includes(transactionType)) return null;
  const receivedAtMs = Date.parse(row.received_hour);
  const expiresAtMs = Date.parse(row.expires_at);
  if (!Number.isFinite(receivedAtMs) || !Number.isFinite(expiresAtMs)) return null;
  if (expiresAtMs <= nowMs || receivedAtMs > nowMs + 5 * 60 * 1000) return null;
  return {
    sourceLabel: SOURCE_LABELS[row.source],
    listingNumber,
    transactionType,
    receivedAtMs,
    hourLabel: formatSeoulHour(receivedAtMs)
  };
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
