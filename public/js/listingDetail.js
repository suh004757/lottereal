/**
 * ListingDetail.js - 리스팅 상세 페이지
 * URL 파라미터에서 ID를 가져와 리스팅 상세 정보를 표시하고 통합 문의 채팅을 엽니다.
 */

import { getListingById } from './services/backendAdapter.js';
import { escapeHtml, safeImageUrl } from './publicRenderSecurity.mjs';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';
import { SAFE_CONTACT_TEL, getPhoneButtonLabel, getPublicContactPhone } from './utils/contactPhone.mjs';
import { formatListingDisplayPrice } from './utils/propertyPrice.mjs';
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
  try {
    const listing = id ? await getListingById(id) : null;
    if (listing) {
      renderDetail(listing);
      bindPhoneBtn(listing);
      bindInquiryButtons(listing);
      return;
    }
    renderClosed();
  } catch (error) {
    console.error('매물 상세 로드 실패', error);
    renderUnavailable();
  }
}

function renderUnavailable() {
  document.title = '매물 정보를 불러올 수 없습니다 | 롯데부동산';
  if (titleEl) titleEl.textContent = '매물 정보를 잠시 불러올 수 없습니다';
  if (infoEl) infoEl.textContent = '거래 완료 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  if (descEl) {
    descEl.replaceChildren();
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'lr-btn lr-btn--primary';
    retry.textContent = '다시 시도';
    retry.addEventListener('click', init);
    descEl.appendChild(retry);
  }
}

/**
 * 거래 완료로 내려간 매물이나 잘못된 링크로 들어온 경우 빈 화면 대신 다음 행동을 안내합니다.
 */
function renderClosed() {
  document.title = '거래가 완료된 매물 | 롯데부동산';
  if (titleEl) titleEl.textContent = '거래가 완료되었거나 내려간 매물입니다';
  if (infoEl) infoEl.textContent = '비슷한 조건의 매물은 직방·다방 등록 매물과 등록 전 매물까지 함께 찾아드립니다.';
  if (descEl) {
    descEl.textContent = '';
    const links = document.createElement('p');
    links.className = 'lr-actions';
    const list = document.createElement('a');
    list.className = 'lr-btn lr-btn--ghost';
    list.href = 'listings.html';
    list.textContent = '매물 목록 보기';
    const request = document.createElement('a');
    request.className = 'lr-btn lr-btn--primary';
    request.href = 'contact.html?intent=listing#inquiry-options';
    request.textContent = '조건 남기기';
    links.append(request, list);
    descEl.appendChild(links);
  }
  if (featuresEl) {
    featuresEl.hidden = true;
    if (featuresEl.previousElementSibling?.tagName === 'H4') featuresEl.previousElementSibling.hidden = true;
  }
  // Nothing left to show or ask about this listing: drop the empty photo and listing chat
  // Their CSS sets display, which outranks the hidden attribute
  const media = document.querySelector('.lr-detail__media');
  if (media) media.style.display = 'none';
  const layout = document.querySelector('.lr-detail');
  if (layout) {
    layout.style.gridTemplateColumns = 'minmax(0, 720px)';
    layout.style.justifyContent = 'center';
  }
  document.querySelectorAll('[data-listing-chat-open]').forEach((link) => { link.style.display = 'none'; });
  const inquirySection = document.getElementById('inquiry');
  if (inquirySection) inquirySection.hidden = true;
  if (phoneBtn) {
    phoneBtn.href = SAFE_CONTACT_TEL;
    phoneBtn.textContent = getPhoneButtonLabel('전화로 조건 말하기');
    phoneBtn.className = 'lr-btn lr-btn--ghost';
  }
}

/**
 * 리스팅 상세 정보를 렌더링합니다.
 * @param {Object} listing - 리스팅 데이터 객체
 */
function renderDetail(listing) {
  if (titleEl) titleEl.textContent = listing.title || '';

  const formattedPrice = formatListingDisplayPrice(listing);
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
    <button type="button" class="lr-detail__thumbnail ${index === 0 ? 'lr-detail__thumbnail--active' : ''}" data-image-index="${index}" aria-label="매물 이미지 ${index + 1} 보기" aria-pressed="${index === 0 ? 'true' : 'false'}">
      <img src="${escapeHtml(image)}" alt="매물 이미지 ${index + 1}">
    </button>
  `).join('');

  // Add click handlers to thumbnails
  const thumbnails = thumbnailsEl.querySelectorAll('.lr-detail__thumbnail');
  thumbnails.forEach((thumbnail, index) => {
    thumbnail.addEventListener('click', () => {
      // Update main image from the validated URL list
      mainImageEl.src = safeImages[index];

      // Update active state
      thumbnails.forEach(t => t.classList.remove('lr-detail__thumbnail--active'));
      thumbnails.forEach(t => t.setAttribute('aria-pressed', 'false'));
      thumbnail.classList.add('lr-detail__thumbnail--active');
      thumbnail.setAttribute('aria-pressed', 'true');
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
  phoneBtn.textContent = getPhoneButtonLabel();
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
