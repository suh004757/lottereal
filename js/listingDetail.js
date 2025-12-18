import { getListingById, createInquiry } from './services/backendAdapter.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id');

const titleEl = document.querySelector('[data-detail-title]');
const infoEl = document.querySelector('[data-detail-info]');
const tagsEl = document.querySelector('[data-detail-tags]');
const featuresEl = document.querySelector('[data-detail-features]');
const imageEl = document.querySelector('[data-detail-image]');
const noteEl = document.querySelector('[data-detail-note]');
const formEl = document.querySelector('[data-inquiry-form]');

init();

async function init() {
  const listing = id ? await getListingById(id) : null;
  if (listing) renderDetail(listing);
  if (formEl) bindForm(listing);
}

function renderDetail(listing) {
  if (titleEl) titleEl.textContent = listing.title || '';
  const infoParts = [
    listing.address || listing.city || '',
    listing.price || '',
    listing.property_type || ''
  ].filter(Boolean);
  if (infoEl) infoEl.textContent = infoParts.join(' · ');
  if (tagsEl) tagsEl.innerHTML = (listing.tags || []).map((t) => `<span>${t}</span>`).join('');
  if (featuresEl) featuresEl.innerHTML = (listing.features || []).map((f) => `<li>${f}</li>`).join('');
  if (noteEl) noteEl.textContent = listing.contactNote || '';
  if (imageEl) imageEl.src = listing.image || (listing.images && listing.images[0]) || '';
}

function bindForm(listing) {
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formEl);
    const payload = {
      listingId: listing?.id,
      listingTitle: listing?.title,
      name: formData.get('name') || '',
      phone: formData.get('phone') || '',
      email: formData.get('email') || '',
      message: formData.get('message') || '',
      metadata: { source: 'public-detail' }
    };
    try {
      await createInquiry(payload);
      alert('문의가 접수되었습니다. 빠르게 연락드리겠습니다.');
      formEl.reset();
    } catch (err) {
      console.error(err);
      alert('문의 접수 중 오류가 발생했습니다.');
    }
  });
}
