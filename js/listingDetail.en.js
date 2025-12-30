/**
 * ListingDetail.en.js - 리스팅 상세 페이지 (영어 버전)
 * 특정 리스팅의 상세 정보를 표시하고 문의 폼을 처리합니다.
 */

import { getListingById, createInquiry } from './services/backendAdapter.js';

// URL 파라미터에서 리스팅 ID 추출
const params = new URLSearchParams(window.location.search);
const id = params.get('id');

// DOM 요소 참조
const titleEl = document.querySelector('[data-detail-title]');
const infoEl = document.querySelector('[data-detail-info]');
const tagsEl = document.querySelector('[data-detail-tags]');
const featuresEl = document.querySelector('[data-detail-features]');
const imageEl = document.querySelector('[data-detail-image]');
const descEl = document.querySelector('[data-detail-desc]');
const noteEl = document.querySelector('[data-detail-note]');
const formEl = document.querySelector('[data-inquiry-form]');
const phoneBtn = document.getElementById('phoneBtn');

/**
 * 초기화 함수
 */
init();

/**
 * 페이지를 초기화합니다.
 */
async function init() {
  const listing = id ? await getListingById(id) : null;
  if (listing) {
    renderDetail(listing);
    bindPhoneBtn(listing);
  }
  if (formEl) bindForm(listing);
}

/**
 * 리스팅 상세 정보를 렌더링합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function renderDetail(listing) {
  if (titleEl) titleEl.textContent = listing.title || '';

  const formattedPrice = formatPrice(listing.price, listing.metadata?.deposit, listing.property_type);
  const infoParts = [
    listing.address || listing.city || '',
    formattedPrice,
    listing.property_type || ''
  ].filter(Boolean);

  if (infoEl) infoEl.textContent = infoParts.join(' \u00b7 ');
  if (tagsEl) tagsEl.innerHTML = (listing.tags || []).map((t) => `<span>${t}</span>`).join('');
  if (featuresEl) featuresEl.innerHTML = (listing.features || []).map((f) => `<li>${f}</li>`).join('');
  if (imageEl) imageEl.src = listing.image || (listing.images && listing.images[0]) || '';
  if (descEl) descEl.innerHTML = (listing.description || '').replace(/\n/g, '<br>');
  if (noteEl) noteEl.textContent = listing.contactNote || '';
}

/**
 * 가격을 포맷팅합니다.
 * @param {number} price - 가격
 * @param {number} deposit - 보증금 (월세의 경우)
 * @param {string} type - 부동산 타입
 * @returns {string} 포맷팅된 가격 문자열
 */
function formatPrice(price, deposit, type) {
  if (!price) return '';
  const rent = Number(price);
  const depositValue = Number(deposit || 0);
  const formatKRW = (value) => `KRW ${Number(value).toLocaleString()}`;
  const normalized = (type || '').toString().trim().toLowerCase();
  const isMonthly = normalized === '월세' || normalized === 'monthly rent';

  if (isMonthly) {
    if (depositValue > 0) return `${formatKRW(depositValue)} / ${formatKRW(rent)} (Monthly)`;
    return `${formatKRW(rent)} (Monthly)`;
  }

  return formatKRW(rent);
}

/**
 * 전화 버튼을 바인딩합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function bindPhoneBtn(listing) {
  if (!phoneBtn) return;

  const contactPhone = listing.contact_phone || '0507-1402-5055';
  const telLink = `tel:${contactPhone.replace(/[^0-9]/g, '')}`;

  phoneBtn.href = telLink;
  phoneBtn.setAttribute('data-phone', contactPhone);

  phoneBtn.addEventListener('click', (e) => {
    if (window.innerWidth > 768) {
      e.preventDefault();
      alert(`Phone Inquiry: ${contactPhone}\n(Direct call available on mobile)`);
    }
  });
}

/**
 * 문의 폼을 바인딩합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function bindForm(listing) {
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formEl);
    const payload = {
      listingId: listing?.id,
      listingTitle: listing?.title,
      name: formData.get('name') || '',
      phone: formData.get('phone') || '',
      email: formData.get('email') || '',
      message: formData.get('message') || '',
      metadata: { source: 'public-detail-en' }
    };
    try {
      await createInquiry(payload);
      alert('Your inquiry has been submitted. We will contact you shortly.');
      formEl.reset();
    } catch (err) {
      console.error(err);
      alert('Failed to submit inquiry.');
    }
  });
}
