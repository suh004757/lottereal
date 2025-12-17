import { getListings } from './services/backendAdapter.js';

const listContainer = document.querySelector('[data-listings-grid]');
const filterForm = document.querySelector('[data-filter-form]');

// Initial Load
(async () => {
  const listings = await getListings();
  renderListings(listings);
})();

if (filterForm) {
  filterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(filterForm);
    const keyword = (formData.get('keyword') || '').toLowerCase();
    const type = formData.get('type') || '';

    // In a real app, we might filter properly on server side (Supabase .eq .ilike)
    // For now, fetch all and client-side filter to mimic previous behavior mostly
    let allListings = await getListings();

    const filtered = allListings.filter((item) => {
      const displayType = item.type || '';
      const matchesType = !type || displayType === type;
      const matchesKeyword =
        !keyword ||
        (item.title && item.title.toLowerCase().includes(keyword)) ||
        (item.location && item.location.toLowerCase().includes(keyword));
      return matchesType && matchesKeyword;
    });

    renderListings(filtered);
  });
}

function renderListings(data) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; width:100%; padding: 50px;">등록된 매물이 없습니다.</p>';
    return;
  }

  data.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    card.innerHTML = `
      <div class="lr-card__thumb" style="background-image:url('${item.image}');"></div>
      <div class="lr-card__body">
        <p class="lr-badge">${item.type === 'residence' ? '주거' : item.type === 'office' ? '사무/상가' : '매물'}</p>
        <h3>${item.title}</h3>
        <p class="lr-text">${item.summary || ''}</p>
        <div class="lr-card__meta">
          <span>${item.location || ''}</span>
          <span>${item.price}</span>
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
