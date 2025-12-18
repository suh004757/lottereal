import { listListingsPublic } from './services/backendAdapter.js';

const listContainer = document.querySelector('[data-listings-grid]');
const filterForm = document.querySelector('[data-filter-form]');

loadListings();

if (filterForm) {
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(filterForm);
    const keyword = (formData.get('keyword') || '').trim();
    const propertyType = formData.get('type') || '';
    const city = formData.get('city') || '';
    const district = formData.get('district') || '';
    const minPrice = formData.get('minPrice') || '';
    const maxPrice = formData.get('maxPrice') || '';
    loadListings({ keyword, propertyType, city, district, minPrice, maxPrice });
  });
}

async function loadListings(filters = {}) {
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="lr-text">불러오는 중...</p>';
  try {
    const data = await listListingsPublic({
      query: filters.keyword || '',
      propertyType: filters.propertyType || '',
      city: filters.city || '',
      district: filters.district || '',
      minPrice: filters.minPrice || undefined,
      maxPrice: filters.maxPrice || undefined,
      page: 1,
      pageSize: 50
    });
    renderListings(data);
  } catch (err) {
    console.error('리스트 로드 실패', err);
    listContainer.innerHTML = '<p class="lr-text">목록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

function renderListings(data) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; width:100%; padding: 50px;">조건에 맞는 매물이 없습니다.</p>';
    return;
  }

  data.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    const image = item.image || (item.images && item.images[0]) || '';
    const badge = item.property_type || item.type || '매물';
    card.innerHTML = `
      <div class="lr-card__thumb" style="background-image:url('${image}');"></div>
      <div class="lr-card__body">
        <p class="lr-badge">${badge}</p>
        <h3>${item.title}</h3>
        <p class="lr-text">${item.description || item.summary || ''}</p>
        <div class="lr-card__meta">
          <span>${item.address || item.city || ''}</span>
          <span>${item.price ? item.price.toLocaleString() : ''}</span>
        </div>
        <div class="lr-card__actions">
          <a class="lr-btn lr-btn--ghost lr-btn--block" href="listing-detail.html?id=${encodeURIComponent(item.id)}">상세 보기</a>
          <a class="lr-btn lr-btn--primary lr-btn--block" href="listing-detail.html?id=${encodeURIComponent(item.id)}#inquiry">문의하기</a>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
}
