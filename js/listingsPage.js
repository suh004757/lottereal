/**
 * ListingsPage.js - 리스팅 목록 페이지
 * 공개 리스팅을 필터링하여 그리드 형태로 표시합니다.
 */

import { listListingsPublic } from './services/backendAdapter.js';

// DOM 요소 참조
const listContainer = document.querySelector('[data-listings-grid]');
const filterForm = document.querySelector('[data-filter-form]');

/**
 * 초기 리스팅 로드
 */
loadListings();

// 필터 폼 이벤트 리스너
if (filterForm) {
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(filterForm);
    const keyword = (formData.get('keyword') || '').trim();
    const propertyType = formData.get('type') || '';
    const city = formData.get('city') || '';
    const district = formData.get('district') || '';
    loadListings({ keyword, propertyType, city, district });
  });
}

/**
 * 리스팅을 로드합니다.
 * @param {Object} filters - 필터 옵션
 */
async function loadListings(filters = {}) {
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="lr-text">불러오는 중...</p>';
  try {
    let data = await listListingsPublic({
      query: filters.keyword || '',
      propertyType: filters.propertyType || '',
      city: filters.city || '',
      district: filters.district || '',
      page: 1,
      pageSize: 50
    });

    // Translate properties if on English page
    if (window.LR_translate) {
      data = window.LR_translate.properties(data);
    }

    renderListings(data);
  } catch (err) {
    console.error('리스트 로드 실패', err);
    listContainer.innerHTML = '<p class="lr-text">목록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

/**
 * 리스팅 목록을 렌더링합니다.
 * @param {Array} data - 리스팅 데이터 배열
 */
function renderListings(data) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!data || data.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; width:100%; padding: 50px;" class="lr-text">
        조건에 맞는 매물이 없습니다.<br><br>
        직방·다방에 등록된 매물도 있습니다. 원하는 조건을 알려주시면 바로 찾아드릴게요.
      </div>`;
    return;
  }

  data.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    const image = item.image || (item.images && item.images[0]) || '';
    const badge = item.property_type || item.type || '매물';

    // 연락처 전화번호 로직
    const contactPhone = item.contact_phone || '0507-1402-5055';
    const telLink = `tel:${contactPhone.replace(/[^0-9]/g, '')}`;

    card.innerHTML = `
      <div class="lr-card__thumb" style="background-image:url('${image}');"></div>
      <div class="lr-card__body">
        <p class="lr-badge">${badge}</p>
        <h3>${item.title}</h3>
        <p class="lr-text">${item.description || item.summary || ''}</p>
        <div class="lr-card__meta">
          <span>${item.address || item.city || ''}</span>
          <span>${formatPrice(item.price, item.metadata?.deposit, item.property_type)}</span>
        </div>
        <div class="lr-card__actions">
          <a class="lr-btn lr-btn--ghost lr-btn--block" href="listing-detail.html?id=${encodeURIComponent(item.id)}">상세 보기</a>
          <a class="lr-btn lr-btn--primary lr-btn--block contact-btn" href="${telLink}" data-phone="${contactPhone}">문의하기</a>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

// 데스크톱 전화 문의 알림
if (listContainer) {
  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.contact-btn');
    if (btn && window.innerWidth > 768) {
      e.preventDefault();
      const phone = btn.getAttribute('data-phone');
      alert(`전화 문의: ${phone}\n(모바일에서는 바로 전화가 연결됩니다)`);
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
  const p = Number(price);
  const d = Number(deposit || 0);
  const typeStr = (type || '').trim();

  // 월세
  if (typeStr === '월세' || typeStr === 'Monthly Rent') {
    if (d > 0) return `${d.toLocaleString()} / ${p.toLocaleString()} 만원`;
    return `${p.toLocaleString()} 만원 (월세)`;
  }

  // 전세 또는 매매
  return `${p.toLocaleString()} 만원`;
}

