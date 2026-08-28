/**
 * ListingsPage.js - 공개 매물 목록 페이지
 * 40~60대 방문자가 가격·위치·입주 조건을 먼저 판단할 수 있게 렌더링합니다.
 */

import { listListingsPublic } from './services/backendAdapter.js';
import { SAFE_CONTACT_TEL, getPublicContactPhone } from './utils/contactPhone.mjs';
import {
  getListingFreshness,
  getListingFreshnessCopy,
  getSafeListingDescription
} from './utils/listingFreshness.mjs';

const listContainer = document.querySelector('[data-listings-grid]');
const filterForm = document.querySelector('[data-filter-form]');

loadListings(readFilters());

if (filterForm) {
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loadListings(readFilters());
  });

  filterForm.addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick-keyword], [data-quick-type]');
    if (!quick) return;
    const keyword = quick.getAttribute('data-quick-keyword');
    const type = quick.getAttribute('data-quick-type');
    if (keyword) filterForm.elements.keyword.value = keyword;
    if (type) filterForm.elements.type.value = type;
    loadListings(readFilters());
  });
}

function readFilters() {
  if (!filterForm) return {};
  const formData = new FormData(filterForm);
  return {
    keyword: (formData.get('keyword') || '').trim(),
    propertyType: formData.get('type') || '',
    city: (formData.get('city') || '').trim(),
    district: (formData.get('district') || '').trim()
  };
}

async function loadListings(filters = {}) {
  if (!listContainer) return;
  listContainer.innerHTML = '<div class="lr-listing-state">매물을 불러오고 있습니다...</div>';
  try {
    let data = await listListingsPublic({
      query: filters.keyword || '',
      propertyType: filters.propertyType || '',
      city: filters.city || '',
      district: filters.district || '',
      page: 1,
      pageSize: 50
    });

    if (window.LR_translate) {
      data = window.LR_translate.properties(data);
    }

    renderListings(data, filters);
  } catch (err) {
    console.error('리스트 로드 실패', err);
    listContainer.innerHTML = `
      <div class="lr-listing-state lr-listing-state--error">
        <strong>매물 목록을 불러오지 못했습니다.</strong>
        <span>전화 주시면 현재 가능한 매물을 바로 확인해드리겠습니다.</span>
        <a class="lr-btn lr-btn--primary" href="tel:050714025055">전화로 문의</a>
      </div>`;
  }
}

function renderListings(data, filters = {}) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'lr-listing-summary';
  summary.innerHTML = `
    <div>
      <p class="lr-kicker">검색 결과</p>
      <h2>${data?.length || 0}개 매물을 확인했습니다</h2>
    </div>
    <p>${buildFilterSummary(filters)}</p>
  `;
  listContainer.appendChild(summary);

  if (!data || data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lr-listing-state';
    empty.innerHTML = `
      <strong>조건에 맞는 공개 매물이 없습니다.</strong>
      <span>등록 전 매물이나 직방·다방에 올라간 매물도 확인해드릴 수 있습니다. 원하시는 조건을 전화로 알려주세요.</span>
      <a class="lr-btn lr-btn--primary" href="tel:050714025055">전화로 조건 말하기</a>
    `;
    listContainer.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'lr-listing-grid';
  data.forEach((item) => grid.appendChild(buildListingCard(item)));
  listContainer.appendChild(grid);
}

function buildListingCard(item) {
  const card = document.createElement('article');
  card.className = 'lr-card lr-card--listing lr-card--listing-premium';

  const image = item.image || (Array.isArray(item.images) && item.images[0]) || 'img/bg-img/lotte_street_view.png';
  const badge = item.property_type || item.type || '매물';
  const contactPhone = getPublicContactPhone();
  const telLink = SAFE_CONTACT_TEL;
  const details = extractDetails(item);
  const freshness = getListingFreshness(item);
  const freshnessCopy = getListingFreshnessCopy(freshness, 'ko');
  const visibleDetails = freshness.needsReview
    ? details.filter((detail) => detail.label !== '입주')
    : details;
  const price = formatPrice(item);

  card.innerHTML = `
    <a class="lr-card__thumb lr-listing-thumb" href="listing-detail.html?id=${encodeURIComponent(item.id)}" style="background-image:url('${escapeAttribute(image)}');" aria-label="${escapeAttribute(item.title || '매물 상세 보기')}">
      <span>${escapeHtml(badge)}</span>
    </a>
    <div class="lr-card__body">
      <div class="lr-listing-topline">
        <p class="lr-badge">${escapeHtml(badge)}</p>
        <span>${escapeHtml(buildLocation(item))}</span>
      </div>
      <h3>${escapeHtml(item.title || '상세 매물')}</h3>
      ${freshnessCopy ? `
        <div class="lr-listing-freshness" role="note">
          <strong>${escapeHtml(freshnessCopy.label)}</strong>
          <span>${escapeHtml(freshnessCopy.message)}</span>
        </div>` : ''}
      <div class="lr-listing-price">${escapeHtml(freshnessCopy && price ? `${freshnessCopy.pricePrefix} ${price}` : price)}</div>
      <div class="lr-listing-facts">
        ${visibleDetails.map((detail) => `<span><strong>${escapeHtml(detail.label)}</strong>${escapeHtml(detail.value)}</span>`).join('')}
      </div>
      <p class="lr-text">${escapeHtml(buildShortDescription(item, freshness))}</p>
      <div class="lr-card__actions lr-listing-actions">
        <a class="lr-btn lr-btn--ghost lr-btn--block" href="listing-detail.html?id=${encodeURIComponent(item.id)}">사진·상세 보기</a>
        <a class="lr-btn lr-btn--primary lr-btn--block contact-btn" href="${telLink}" data-phone="${escapeAttribute(formatPhone(contactPhone))}">전화 문의</a>
      </div>
    </div>
  `;
  return card;
}

if (listContainer) {
  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.contact-btn');
    if (btn && window.innerWidth > 768) {
      e.preventDefault();
      const phone = btn.getAttribute('data-phone');
      alert(`전화 문의: ${phone}\n모바일에서는 바로 전화가 연결됩니다.`);
    }
  });
}

function buildFilterSummary(filters) {
  const parts = [];
  if (filters.keyword) parts.push(`검색어: ${filters.keyword}`);
  if (filters.propertyType) parts.push(`유형: ${filters.propertyType}`);
  if (filters.city || filters.district) parts.push(`지역: ${[filters.city, filters.district].filter(Boolean).join(' ')}`);
  return parts.length ? parts.join(' · ') : '송파구 중심 공개 매물입니다. 조건을 바꾸면 바로 다시 보여드립니다.';
}

function buildLocation(item) {
  return [item.city, item.district, item.address].filter(Boolean).join(' ') || '위치 문의';
}

function formatPrice(item) {
  const type = String(item.property_type || item.type || '').trim();
  const price = toNumber(item.price);
  const metadata = item.metadata || {};
  const deposit = toNumber(metadata.deposit || item.deposit);
  const monthlyFromText = parseMonthlyRent(item.description || '');

  if (type.includes('월세')) {
    const depositText = deposit || price;
    const monthlyText = monthlyFromText || toNumber(metadata.monthly_rent || metadata.monthlyRent);
    if (depositText && monthlyText) return `보증금 ${depositText.toLocaleString()} / 월세 ${monthlyText.toLocaleString()}만원`;
    if (price) return `월세 ${price.toLocaleString()}만원`;
    return '월세 문의';
  }

  if (type.includes('전세')) return price ? `전세 ${price.toLocaleString()}만원` : '전세가 문의';
  if (type.includes('매매')) return price ? `매매 ${price.toLocaleString()}만원` : '매매가 문의';
  return price ? `${price.toLocaleString()}만원` : '가격 문의';
}

function extractDetails(item) {
  const text = item.description || '';
  const details = [];
  const area = matchFirst(text, /(전용\s*[0-9.]+\s*평|공급\s*[0-9.]+\s*평|[0-9.]+\s*평)/);
  const rooms = matchFirst(text, /(방\s*[0-9]+개|[0-9]+룸|쓰리룸|투룸|원룸)/);
  const moveIn = matchFirst(text, /(즉시\s*입주\s*가능|입주\s*가능|빠른\s*입주)/);
  const parking = matchFirst(text, /(주차\s*가능|주차\s*협의|주차\s*불가)/);
  const management = matchFirst(text, /(관리비\s*[0-9,]+\s*만원?)/);

  if (area) details.push({ label: '면적', value: area });
  if (rooms) details.push({ label: '구조', value: normalizeRoomText(rooms) });
  if (moveIn) details.push({ label: '입주', value: moveIn });
  if (parking) details.push({ label: '주차', value: parking });
  if (management) details.push({ label: '관리비', value: management.replace(/\s+/g, ' ') });

  if (!details.length) {
    details.push({ label: '상담', value: '조건 확인' });
    details.push({ label: '지역', value: item.address || item.district || '문의' });
  }

  return details.slice(0, 4);
}

function buildShortDescription(item, freshness = getListingFreshness(item)) {
  const text = getSafeListingDescription(item, freshness, 'ko').replace(/[📍👉📞]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return '자세한 조건은 전화로 빠르게 안내해드립니다.';
  return text.length > 96 ? `${text.slice(0, 96)}…` : text;
}

function parseMonthlyRent(text) {
  const match = String(text).match(/월세\s*([0-9,]+)\s*만원?/);
  return match ? toNumber(match[1]) : 0;
}

function matchFirst(text, regex) {
  const match = String(text).match(regex);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function normalizeRoomText(value) {
  return value.replace('쓰리룸', '3룸').replace('투룸', '2룸').replace('원룸', '1룸');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function formatPhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.startsWith('02') && digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.startsWith('02') && digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return value || '0507-1402-5055';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
