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
    loadListings({ keyword, propertyType, city, district });
  });
}

async function loadListings(filters = {}) {
  if (!listContainer) return;
  listContainer.innerHTML = '<p class="lr-text">Loading...</p>';
  try {
    const data = await listListingsPublic({
      query: filters.keyword || '',
      propertyType: filters.propertyType || '',
      city: filters.city || '',
      district: filters.district || '',
      page: 1,
      pageSize: 50
    });
    renderListings(data);
  } catch (err) {
    console.error('Failed to load list', err);
    listContainer.innerHTML = '<p class="lr-text">Failed to load listings.</p>';
  }
}

function renderListings(data) {
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (!data || data.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center; width:100%; padding: 50px;">No listings match your filters.</p>';
    return;
  }

  data.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    const image = item.image || (item.images && item.images[0]) || '';
    const badge = item.property_type || item.type || 'Listing';
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
          <a class="lr-btn lr-btn--ghost lr-btn--block" href="listing-detail-en.html?id=${encodeURIComponent(item.id)}">View details</a>
          <a class="lr-btn lr-btn--primary lr-btn--block" href="listing-detail-en.html?id=${encodeURIComponent(item.id)}#inquiry">Inquire</a>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
}
