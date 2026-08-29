import { normalizePublicReceipts, renderPublicReceipts } from './externalInquiryReceipts.mjs';
import { listPublicExternalInquiryReceipts } from './services/inquiryReceiptAdapter.js';

const section = document.querySelector('[data-external-inquiry-receipts]');

if (section) {
  const list = section.querySelector('[data-receipt-list]');
  loadReceipts();

  async function loadReceipts() {
    if (!list) return;
    list.innerHTML = '<p class="lr-receipt-empty">최근 접수 내역을 확인하는 중입니다.</p>';
    try {
      const rows = await listPublicExternalInquiryReceipts({ limit: 8 });
      list.innerHTML = renderPublicReceipts(normalizePublicReceipts(rows));
    } catch (_error) {
      list.innerHTML = '<p class="lr-receipt-empty">접수 현황을 잠시 불러오지 못했습니다. 문의 접수 여부는 전화로도 확인할 수 있습니다.</p>';
    }
  }
}
