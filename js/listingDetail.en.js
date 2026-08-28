/**
 * ListingDetail.en.js - 리스팅 상세 페이지 (영어 버전)
 * 특정 리스팅의 상세 정보를 표시하고 문의 폼을 처리합니다.
 */

import { getListingById, createInquiry } from './services/backendAdapter.js';
import { buildInquiryAnalyticsEvent, buildInquiryPayload } from './inquiryMvp.js';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';
import { SAFE_CONTACT_TEL, getPublicContactPhone } from './utils/contactPhone.mjs';
import {
  getListingFreshness,
  getListingFreshnessCopy,
  getSafeListingDescription
} from './utils/listingFreshness.mjs';

// URL 파라미터에서 리스팅 ID 추출
const params = new URLSearchParams(window.location.search);
const id = params.get('id');

// DOM 요소 참조
const titleEl = document.querySelector('[data-detail-title]');
const infoEl = document.querySelector('[data-detail-info]');
const tagsEl = document.querySelector('[data-detail-tags]');
const featuresEl = document.querySelector('[data-detail-features]');

const descEl = document.querySelector('[data-detail-desc]');
const noteEl = document.querySelector('[data-detail-note]');
const formEl = document.querySelector('[data-inquiry-form]');
const formStatus = document.querySelector('[data-inquiry-status]');
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
  const freshness = getListingFreshness(listing);
  const freshnessCopy = getListingFreshnessCopy(freshness, 'en');
  const infoParts = [
    listing.address || listing.city || '',
    freshnessCopy && formattedPrice ? `${freshnessCopy.pricePrefix} ${formattedPrice}` : formattedPrice,
    listing.property_type || ''
  ].filter(Boolean);

  if (infoEl) infoEl.textContent = infoParts.join(' \u00b7 ');
  if (tagsEl) tagsEl.innerHTML = (listing.tags || []).map((t) => `<span>${t}</span>`).join('');
  if (featuresEl) featuresEl.innerHTML = (listing.features || []).map((f) => `<li>${f}</li>`).join('');

  // Render image gallery
  renderImageGallery(listing);
  if (descEl) {
    if (freshnessCopy) {
      descEl.insertAdjacentHTML('beforebegin', `
        <div class="lr-listing-freshness lr-listing-freshness--detail" role="note">
          <strong>${freshnessCopy.label}</strong>
          <span>${freshnessCopy.message}</span>
        </div>`);
    }
    descEl.textContent = getSafeListingDescription(listing, freshness, 'en');
  }
  if (noteEl) noteEl.textContent = listing.contactNote || '';
  applySeo(listing, formattedPrice, freshness);
}

/**
 * Renders the image gallery.
 * @param {Object} listing - Listing data object
 */
function renderImageGallery(listing) {
  const mainImageEl = document.querySelector('[data-detail-main-image]');
  const thumbnailsEl = document.querySelector('[data-detail-thumbnails]');

  if (!mainImageEl || !thumbnailsEl) return;

  // Get all images (support both 'images' array and single 'image' field)
  let images = [];
  if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
    images = listing.images;
  } else if (listing.image) {
    images = [listing.image];
  }

  // Set the first image as the main image
  if (images.length > 0) {
    mainImageEl.src = images[0];
    mainImageEl.alt = listing.title || 'Property image';
  }

  // Create thumbnails
  thumbnailsEl.innerHTML = images.map((img, index) => `
    <div class="lr-detail__thumbnail ${index === 0 ? 'lr-detail__thumbnail--active' : ''}" data-image-index="${index}">
      <img src="${img}" alt="Property image ${index + 1}">
    </div>
  `).join('');

  // Add click handlers to thumbnails
  const thumbnails = thumbnailsEl.querySelectorAll('.lr-detail__thumbnail');
  thumbnails.forEach((thumbnail, index) => {
    thumbnail.addEventListener('click', () => {
      // Update main image
      mainImageEl.src = images[index];

      // Update active state
      thumbnails.forEach(t => t.classList.remove('lr-detail__thumbnail--active'));
      thumbnail.classList.add('lr-detail__thumbnail--active');
    });
  });
}

function applySeo(listing, formattedPrice, freshness) {
  const title = listing.title
    ? `${listing.title} | Lotte Real Estate`
    : 'Listing Details | Lotte Real Estate';
  const location = [listing.district, listing.city, listing.address].filter(Boolean).join(', ');
  const description = [
    listing.title,
    location,
    formattedPrice,
    getSafeListingDescription(listing, freshness, 'en') || listing.property_type || 'Real estate listing details in Songpa and Gangnam'
  ].filter(Boolean).join(' | ').slice(0, 160);
  const canonical = buildAbsoluteUrl(`listing-detail-en.html?id=${encodeURIComponent(listing.id || '')}`);
  const image = listing.images?.[0] || listing.image || buildAbsoluteUrl('img/bg-img/lotte_street_view.png');

  updateSeoMeta({
    title,
    description,
    canonical,
    ogImage: image,
    type: 'article',
    locale: 'en_US',
    siteName: 'Lotte Real Estate'
  });

  renderJsonLd({
    id: 'listing-en-breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: buildAbsoluteUrl('/EN.html') },
        { '@type': 'ListItem', position: 2, name: 'Listings', item: buildAbsoluteUrl('/listings-en.html') },
        { '@type': 'ListItem', position: 3, name: listing.title || 'Listing Details', item: canonical }
      ]
    }
  });

  renderJsonLd({
    id: 'listing-en-webpage',
    data: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: listing.title || 'Listing Details',
      description,
      url: canonical,
      inLanguage: 'en',
      primaryImageOfPage: image
    }
  });
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

  const contactPhone = getPublicContactPhone();
  const telLink = SAFE_CONTACT_TEL;

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
    if (!formData.has('privacyConsent')) {
      showFormStatus('Please agree to the privacy notice before submitting.', 'error');
      return;
    }
    let payload;
    try {
      payload = buildInquiryPayload({
        inquiryType: 'listing',
        sourceChannel: 'website',
        externalListingRef: '',
        callbackTime: 'anytime',
        privacyConsent: formData.has('privacyConsent'),
      name: formData.get('name') || '',
      phone: formData.get('phone') || '',
        message: formData.get('message') || ''
      });
    } catch (_) {
      showFormStatus('Please check your phone number.', 'error');
      return;
    }
    payload.listingId = listing?.id || null;
    payload.listingTitle = listing?.title || payload.listingTitle;
    payload.metadata.entry_point = 'english-listing-detail';
    const submitButton = formEl.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    showFormStatus('Submitting your inquiry securely…', 'pending');
    try {
      const result = await createInquiry(payload);
      if (!result?.success || result.persisted !== true) throw new Error('INQUIRY_NOT_PERSISTED');
      if (typeof window.gtag === 'function') {
        const analytics = buildInquiryAnalyticsEvent(payload);
        window.gtag('event', analytics.name, { ...analytics.params, language: 'en' });
      }
      showFormStatus('Your inquiry has been submitted. We will contact you shortly.', 'success');
      formEl.reset();
    } catch (err) {
      console.error('[English Inquiry] submission failed', err);
      showFormStatus('Submission failed. Please try again or call us.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function showFormStatus(message, state) {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.dataset.state = state;
  formStatus.setAttribute('role', state === 'error' ? 'alert' : 'status');
}
