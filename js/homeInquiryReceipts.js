import { normalizePublicReceipts, renderPublicReceipts } from './externalInquiryReceipts.mjs';
import { listPublicExternalInquiryReceipts } from './services/inquiryReceiptAdapter.js';

const section = document.querySelector('[data-external-inquiry-receipts]');

if (section) {
  const list = section.querySelector('[data-receipt-list]');
  loadReceipts();

  async function loadReceipts() {
    if (!list) return;
    list.innerHTML = '<p class="lr-receipt-empty">실시간 관심 현황을 불러오는 중입니다.</p>';
    try {
      const rows = await listPublicExternalInquiryReceipts({ limit: 8 });
      list.innerHTML = renderPublicReceipts(normalizePublicReceipts(rows));
    } catch (_error) {
      list.innerHTML = '<div class="lr-receipt-empty"><strong>관심 현황을 잠시 불러오지 못했습니다.</strong><span>궁금한 매물은 전화나 문의로 바로 확인해드릴게요.</span><a href="contact.html#inquiry-options">매물 문의하기</a></div>';
    }
  }
}
