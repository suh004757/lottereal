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
    listContainer.innerHTML = `
      <div style="text-align:center; width:100%; padding: 50px;" class="lr-text">
        No listings match your filters.<br><br>
        Some listings may be on Zigbang or Dabang. Share your requirements and we will find options for you.
      </div>`;
    return;
  }

  data.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    const image = item.image || (item.images && item.images[0]) || '';
    const badge = item.property_type || item.type || 'Listing';

    // Contact phone logic
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
          <a class="lr-btn lr-btn--ghost lr-btn--block" href="listing-detail-en.html?id=${encodeURIComponent(item.id)}">View details</a>
          <a class="lr-btn lr-btn--primary lr-btn--block contact-btn" href="${telLink}" data-phone="${contactPhone}">Inquire</a>
        </div>
      </div>
    `;
    listContainer.appendChild(card);
  });
}

// Phone inquiry alert for desktop
if (listContainer) {
  listContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.contact-btn');
    if (btn && window.innerWidth > 768) {
      e.preventDefault();
      const phone = btn.getAttribute('data-phone');
      alert(`Phone Inquiry: ${phone}\n(Direct call available on mobile)`);
    }
  });
}

function formatPrice(price, deposit, type) {
  if (!price) return '';
  const monthlyKeywords = ['월세', 'monthly rent'];
  const typeStr = (type || '').toString().trim().toLowerCase();
  const isMonthly = monthlyKeywords.includes(typeStr);
  const formatKRW = (value) => `₩${Number(value).toLocaleString()}`;
  const rent = Number(price);
  const depositValue = Number(deposit || 0);

  if (isMonthly) {
    if (depositValue > 0) return `${formatKRW(depositValue)} / ${formatKRW(rent)} (Monthly)`;
    return `${formatKRW(rent)} (Monthly)`;
  }

  return formatKRW(rent);
}
