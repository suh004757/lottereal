/**
 * ListingDetail.js - 리스팅 상세 페이지
 * URL 파라미터에서 ID를 가져와 리스팅 상세 정보를 표시하고 통합 문의 채팅을 엽니다.
 */

import { getListingById } from './services/backendAdapter.js';
import { escapeHtml, safeImageUrl } from './publicRenderSecurity.mjs';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';
import { SAFE_CONTACT_TEL, getPublicContactPhone } from './utils/contactPhone.mjs';
import { formatManwonAmount } from './utils/propertyPrice.mjs';
import { getListingDetailUrl } from './utils/listingRoutes.mjs';
import {
  getListingFreshness,
  getListingFreshnessCopy,
  getSafeListingDescription
} from './utils/listingFreshness.mjs';

// URL 파라미터에서 리스팅 ID 가져오기
const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const dedicatedDetailUrl = getListingDetailUrl({ id });
if (id && !dedicatedDetailUrl.startsWith('listing-detail.html?')) {
  window.location.replace(dedicatedDetailUrl);
}

// DOM 요소 참조
const titleEl = document.querySelector('[data-detail-title]');
const infoEl = document.querySelector('[data-detail-info]');
const tagsEl = document.querySelector('[data-detail-tags]');
const featuresEl = document.querySelector('[data-detail-features]');

const descEl = document.querySelector('[data-detail-desc]');
const noteEl = document.querySelector('[data-detail-note]');
const phoneBtn = document.getElementById('phoneBtn');

/**
 * 페이지 초기화 함수
 */
async function init() {
  const listing = id ? await getListingById(id) : null;
  if (listing) {
    renderDetail(listing);
    bindPhoneBtn(listing);
    bindInquiryButtons(listing);
  }
}

/**
 * 리스팅 상세 정보를 렌더링합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function renderDetail(listing) {
  if (titleEl) titleEl.textContent = listing.title || '';

  const formattedPrice = formatPrice(listing);
  const freshness = getListingFreshness(listing);
  const freshnessCopy = getListingFreshnessCopy(freshness, 'ko');

  const infoParts = [
    listing.address || listing.city || '',
    freshnessCopy && formattedPrice ? `${freshnessCopy.pricePrefix} ${formattedPrice}` : formattedPrice,
    // 가격에 이미 거래유형이 들어 있으면 다시 붙이지 않습니다
    listing.property_type && formattedPrice.includes(listing.property_type) ? '' : (listing.property_type || '')
  ].filter(Boolean);
  if (infoEl) infoEl.textContent = infoParts.join(' · ');
  if (tagsEl) tagsEl.innerHTML = (listing.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join('');
  if (featuresEl) {
    const features = listing.features || [];
    featuresEl.innerHTML = features.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
    // 특징이 없으면 빈 제목을 남기지 않습니다
    featuresEl.hidden = features.length === 0;
    if (featuresEl.previousElementSibling?.tagName === 'H4') featuresEl.previousElementSibling.hidden = features.length === 0;
  }
  if (descEl) {
    if (freshnessCopy) {
      descEl.insertAdjacentHTML('beforebegin', `
        <div class="lr-listing-freshness lr-listing-freshness--detail" role="note">
          <strong>${freshnessCopy.label}</strong>
          <span>${freshnessCopy.message}</span>
        </div>`);
    }
    // 확인 필요 안내가 이미 같은 내용을 말하므로 보관용 설명 문단은 생략합니다
    descEl.textContent = freshnessCopy ? '' : getSafeListingDescription(listing, freshness, 'ko');
  }
  if (noteEl) noteEl.textContent = listing.contactNote || '';

  // Render image gallery
  renderImageGallery(listing);
  applySeo(listing, formattedPrice, freshness);
}

/**
 * 이미지 갤러리를 렌더링합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function renderImageGallery(listing) {
  const mainImageEl = document.querySelector('[data-detail-main-image]');
  const thumbnailsEl = document.querySelector('[data-detail-thumbnails]');

  if (!mainImageEl || !thumbnailsEl) return;

  // Get and validate every image URL (support both 'images' array and single 'image' field)
  let safeImages = [];
  if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
    safeImages = listing.images.map((image) => safeImageUrl(image)).filter(Boolean);
  } else if (listing.image) {
    const safeImage = safeImageUrl(listing.image);
    if (safeImage) safeImages = [safeImage];
  }

  // Set the first safe image as the main image
  if (safeImages.length > 0) {
    mainImageEl.src = safeImages[0];
    mainImageEl.alt = listing.title || 'Listing image';
  }

  // Create thumbnails from validated URLs only
  thumbnailsEl.innerHTML = safeImages.map((image, index) => `
    <div class="lr-detail__thumbnail ${index === 0 ? 'lr-detail__thumbnail--active' : ''}" data-image-index="${index}">
      <img src="${escapeHtml(image)}" alt="매물 이미지 ${index + 1}">
    </div>
  `).join('');

  // Add click handlers to thumbnails
  const thumbnails = thumbnailsEl.querySelectorAll('.lr-detail__thumbnail');
  thumbnails.forEach((thumbnail, index) => {
    thumbnail.addEventListener('click', () => {
      // Update main image from the validated URL list
      mainImageEl.src = safeImages[index];

      // Update active state
      thumbnails.forEach(t => t.classList.remove('lr-detail__thumbnail--active'));
      thumbnail.classList.add('lr-detail__thumbnail--active');
    });
  });
}

function applySeo(listing, formattedPrice, freshness) {
  const title = listing.title
    ? `${listing.title} | 롯데부동산`
    : '매물 상세 | 롯데부동산';
  const location = [listing.district, listing.city, listing.address].filter(Boolean).join(' ');
  const description = [
    listing.title,
    location,
    formattedPrice,
    getSafeListingDescription(listing, freshness, 'ko') || listing.property_type || '송파·강남 부동산 상세 정보'
  ].filter(Boolean).join(' | ').slice(0, 160);
  const canonical = buildAbsoluteUrl(`listing-detail.html?id=${encodeURIComponent(listing.id || '')}`);
  const image = safeImageUrl(listing.images?.[0] || listing.image)
    || buildAbsoluteUrl('img/bg-img/lotte_street_view.png');

  updateSeoMeta({
    title,
    description,
    canonical,
    ogImage: image,
    type: 'article',
    locale: 'ko_KR',
    siteName: '롯데부동산'
  });

  renderJsonLd({
    id: 'listing-breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: buildAbsoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Listings', item: buildAbsoluteUrl('/listings.html') },
        { '@type': 'ListItem', position: 3, name: listing.title || 'Listing Detail', item: canonical }
      ]
    }
  });

  renderJsonLd({
    id: 'listing-webpage',
    data: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: listing.title || '매물 상세',
      description,
      url: canonical,
      inLanguage: 'ko-KR',
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
function formatPrice(listing) {
  const price = Number(listing.price || 0);
  const metadata = listing.metadata || {};
  const typeStr = String(listing.property_type || '').trim();

  // 월세: metadata.deposit가 있으면 price는 월세, 없으면 price가 보증금이고 월세는 설명에서 찾습니다
  if (typeStr === '월세' || typeStr === 'Monthly Rent') {
    const metaDeposit = Number(metadata.deposit || 0);
    const deposit = metaDeposit || price;
    const monthly = metaDeposit
      ? price
      : Number(metadata.monthly_rent || metadata.monthlyRent || 0) || parseMonthlyRent(listing.description);
    if (deposit && monthly) return `보증금 ${deposit.toLocaleString()} / 월세 ${monthly.toLocaleString()}만원`;
    return price ? `월세 ${price.toLocaleString()}만원` : '';
  }

  // 전세 또는 매매
  return price ? formatManwonAmount(price) : '';
}

function parseMonthlyRent(text) {
  const match = String(text || '').match(/월세\s*([0-9,]+)\s*만원?/);
  return match ? Number(match[1].replace(/,/g, '')) : 0;
}

/**
 * 전화 버튼을 바인딩합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function bindPhoneBtn(listing) {
  if (!phoneBtn) return;

  const contactPhone = getPublicContactPhone();
  const telLink = SAFE_CONTACT_TEL;

  // href 동적 설정
  phoneBtn.href = telLink;
  phoneBtn.setAttribute('data-phone', contactPhone);

  phoneBtn.addEventListener('click', (e) => {
    // 데스크톱에서는 첫 클릭에 버튼에 번호를 보여줍니다
    if (window.innerWidth > 768 && !phoneBtn.dataset.revealed) {
      e.preventDefault();
      phoneBtn.dataset.revealed = 'true';
      phoneBtn.textContent = contactPhone;
    }
  });
}

function bindInquiryButtons(listing) {
  document.querySelectorAll('[data-listing-chat-open]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('lottereal:open-inquiry', {
        detail: {
          listingId: listing.id,
          listingTitle: listing.title || '롯데부동산 매물'
        }
      }));
    });
  });
}

// 일반 상세일 때만 초기화 실행
if (!id || dedicatedDetailUrl.startsWith('listing-detail.html?')) init();
