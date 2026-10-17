/**
 * ListingsPage.js - 공개 매물 목록 페이지
 * 40~60대 방문자가 가격·위치·입주 조건을 먼저 판단할 수 있게 렌더링합니다.
 */

import { listListingsPublic } from './services/backendAdapter.js';
import { SAFE_CONTACT_TEL, getPhoneButtonLabel } from './utils/contactPhone.mjs';
import { formatListingDisplayPrice } from './utils/propertyPrice.mjs';
import { getListingDetailUrl } from './utils/listingRoutes.mjs';
import { getExternalProfileLinks } from './config/externalProfiles.mjs';
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

  const hasListings = Array.isArray(data) && data.length > 0;
  const hasFilters = Boolean(filters.keyword || filters.propertyType || filters.city || filters.district);
  const summary = document.createElement('div');
  summary.className = 'lr-listing-summary';
  summary.innerHTML = `
    <div>
      <p class="lr-kicker">${hasListings ? '검색 결과' : '현재 공개 매물'}</p>
      <h2>${hasListings ? `${data.length}개 매물을 확인했습니다` : (hasFilters ? '이 조건의 공개 매물은 지금 없습니다' : '지금 사이트에 올린 매물은 없습니다')}</h2>
    </div>
    <p>${hasListings ? buildFilterSummary(filters) : '대부분의 매물은 직방·다방에 먼저 올리고 있습니다. 조건을 알려주시면 그쪽 매물과 등록 전 매물까지 함께 찾아드립니다.'}</p>
  `;
  listContainer.appendChild(summary);

  // No public listings: the request card is the page's main action, not an empty box
  if (!hasListings) {
    const grid = document.createElement('div');
    grid.className = 'lr-listing-grid';
    grid.appendChild(buildRequestCard());
    listContainer.appendChild(grid);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'lr-listing-grid';
  data.forEach((item) => grid.appendChild(buildListingCard(item)));
  grid.appendChild(buildRequestCard());
  listContainer.appendChild(grid);
}

function buildRequestCard() {
  const card = document.createElement('article');
  card.className = 'lr-listing-request';
  const kicker = document.createElement('p');
  kicker.className = 'lr-kicker';
  kicker.textContent = '맞춤 매물 요청';
  const title = document.createElement('h3');
  title.textContent = '찾는 매물이 없나요? 조건만 알려주세요';
  const body = document.createElement('p');
  body.textContent = '공개 전 매물과 직방·다방 등록 매물까지 함께 확인해 방문 전에 후보를 추려드립니다.';
  const points = document.createElement('ul');
  ['예산·보증금·월세', '희망 동네와 입주 시기', '꼭 필요한 조건 한두 가지'].forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    points.appendChild(li);
  });
  const actions = document.createElement('div');
  actions.className = 'lr-actions';
  const call = document.createElement('a');
  call.className = 'lr-btn lr-btn--primary';
  call.href = SAFE_CONTACT_TEL;
  call.textContent = '전화로 조건 말하기';
  const form = document.createElement('a');
  form.className = 'lr-btn lr-btn--ghost';
  form.href = 'contact.html?intent=listing#inquiry-options';
  form.textContent = '조건 남기기';
  actions.append(call, form);
  const external = buildExternalProfiles();
  const intro = document.createElement('div');
  intro.append(kicker, title, body);
  const next = document.createElement('div');
  next.append(points, actions, external);
  card.append(intro, next);
  return card;
}

// Most listings live on 직방/다방; until the office's public pages are set they read 준비 중
function buildExternalProfiles() {
  const wrap = document.createElement('div');
  wrap.className = 'lr-listing-external';
  const label = document.createElement('p');
  label.textContent = '직방·다방 등록 매물';
  const row = document.createElement('div');
  getExternalProfileLinks().forEach(({ label: name, href }) => {
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${name}에서 보기`;
      row.appendChild(link);
    } else {
      const pending = document.createElement('span');
      pending.className = 'is-pending';
      pending.textContent = `${name} · 준비 중`;
      row.appendChild(pending);
    }
  });
  wrap.append(label, row);
  return wrap;
}

function buildListingCard(item) {
  const card = document.createElement('article');
  card.className = 'lr-card lr-card--listing lr-card--listing-premium';

  const image = item.image || (Array.isArray(item.images) && item.images[0]) || 'img/bg-img/lotte_street_view.webp';
  const badge = item.property_type || item.type || '매물';
  const telLink = SAFE_CONTACT_TEL;
  const details = extractDetails(item);
  const freshness = getListingFreshness(item);
  const freshnessCopy = getListingFreshnessCopy(freshness, 'ko');
  const visibleDetails = freshness.needsReview
    ? details.filter((detail) => detail.label !== '입주')
    : details;
  const price = formatListingDisplayPrice(item, { emptyLabel: true });
  const detailUrl = getListingDetailUrl(item);

  card.innerHTML = `
    <a class="lr-card__thumb lr-listing-thumb" href="${detailUrl}" style="background-image:url('${escapeAttribute(image)}');" aria-label="${escapeAttribute(item.title || '매물 상세 보기')}">
      <span>${escapeHtml(badge)}</span>
    </a>
    <div class="lr-card__body">
      <p class="lr-listing-location">${escapeHtml(buildLocation(item))}</p>
      <h3>${escapeHtml(item.title || '상세 매물')}</h3>
      ${freshnessCopy ? `
        <div class="lr-listing-freshness" role="note">
          <strong>${escapeHtml(freshnessCopy.label)}</strong>
          <span>${escapeHtml(freshnessCopy.message)}</span>
        </div>` : ''}
      <div class="lr-listing-price">${freshnessCopy && price ? `<small>${escapeHtml(freshnessCopy.pricePrefix)}</small>` : ''}${escapeHtml(price)}</div>
      <div class="lr-listing-facts">
        ${visibleDetails.map((detail) => `<span><strong>${escapeHtml(detail.label)}</strong>${escapeHtml(detail.value)}</span>`).join('')}
      </div>
      ${freshnessCopy ? '' : `<p class="lr-text">${escapeHtml(buildShortDescription(item, freshness))}</p>`}
      <div class="lr-card__actions lr-listing-actions">
        <a class="lr-btn lr-btn--ghost lr-btn--block" href="${detailUrl}">사진·상세 보기</a>
        <a class="lr-btn lr-btn--primary lr-btn--block contact-btn" href="${telLink}">${escapeHtml(getPhoneButtonLabel())}</a>
      </div>
    </div>
  `;
  return card;
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

function matchFirst(text, regex) {
  const match = String(text).match(regex);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function normalizeRoomText(value) {
  return value.replace('쓰리룸', '3룸').replace('투룸', '2룸').replace('원룸', '1룸');
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
