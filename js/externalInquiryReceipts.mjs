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
    return '<p class="lr-receipt-empty">최근 24시간 내 공개 가능한 접수 내역이 없습니다.</p>';
  }
  return receipts.map((receipt) => `
    <article class="lr-receipt-row">
      <div>
        <strong>${escapeHtml(receipt.sourceLabel)} 매물번호 ${escapeHtml(receipt.listingNumber)}</strong>
        <span>${escapeHtml(receipt.hourLabel)} 접수</span>
      </div>
      <span class="lr-receipt-status">접수됨</span>
    </article>
  `).join('');
}

function normalizeRow(row, nowMs) {
  if (!row || row.source !== 'zigbang' || row.status !== 'received') return null;
  const listingNumber = String(row.listing_number || '');
  if (!/^[0-9]{5,20}$/.test(listingNumber)) return null;
  const receivedAtMs = Date.parse(row.received_hour);
  const expiresAtMs = Date.parse(row.expires_at);
  if (!Number.isFinite(receivedAtMs) || !Number.isFinite(expiresAtMs)) return null;
  if (expiresAtMs <= nowMs || receivedAtMs > nowMs + 5 * 60 * 1000) return null;
  return {
    sourceLabel: SOURCE_LABELS[row.source],
    listingNumber,
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
