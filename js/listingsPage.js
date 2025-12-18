import { listListingsPublic } from './services/backendAdapter.js';

const listContainer = document.querySelector('[data-listings-grid]');
const filterForm = document.querySelector('[data-filter-form]');

loadListings();

if (filterForm) {
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(filterForm);
    const keyword = (formData.get('keyword') || '').toLowerCase();
    const type = formData.get('type') || '';
    loadListings(keyword, type);
  });
}

async function loadListings(keyword = '', type = '') {
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="lr-text">불러오는 중...</p>';
  try {
    const data = await listListingsPublic({ query: keyword, page: 1, pageSize: 50 });
    const filtered = type ? data.filter((item) => (item.property_type || item.type || '') === type) : data;
    renderListings(filtered);
  } catch (err) {
    console.error('리스트 로드 실패', err);
    listContainer.innerHTML = '<p class="lr-text">매물 불러오기에 실패했습니다.</p>';
  }
}

function renderListings(data) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; width:100%; padding: 50px;">등록된 매물이 없습니다.</p>';
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
          <span>${item.price || ''}</span>
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
