import { getListingById, createInquiry } from './services/backendAdapter.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id');

const titleEl = document.querySelector('[data-detail-title]');
const infoEl = document.querySelector('[data-detail-info]');
const tagsEl = document.querySelector('[data-detail-tags]');
const featuresEl = document.querySelector('[data-detail-features]');
const imageEl = document.querySelector('[data-detail-image]');
const descEl = document.querySelector('[data-detail-desc]');
const noteEl = document.querySelector('[data-detail-note]');
const formEl = document.querySelector('[data-inquiry-form]');

const phoneBtn = document.getElementById('phoneBtn');

init();

async function init() {
  const listing = id ? await getListingById(id) : null;
  if (listing) {
    renderDetail(listing);
    bindPhoneBtn(listing);
  }
  if (formEl) bindForm(listing);
}

function renderDetail(listing) {
  if (titleEl) titleEl.textContent = listing.title || '';

  const formattedPrice = formatPrice(listing.price, listing.metadata?.deposit, listing.property_type);

  const infoParts = [
    listing.address || listing.city || '',
    formattedPrice,
    listing.property_type || ''
  ].filter(Boolean);
  if (infoEl) infoEl.textContent = infoParts.join(' · ');
  if (tagsEl) tagsEl.innerHTML = (listing.tags || []).map((t) => `<span>${t}</span>`).join('');
  if (featuresEl) featuresEl.innerHTML = (listing.features || []).map((f) => `<li>${f}</li>`).join('');
  if (descEl) descEl.innerHTML = (listing.description || '').replace(/\n/g, '<br>');
  if (noteEl) noteEl.textContent = listing.contactNote || '';
  if (imageEl) imageEl.src = listing.image || (listing.images && listing.images[0]) || '';
}

function formatPrice(price, deposit, type) {
  if (!price) return '';
  const p = Number(price);
  const d = Number(deposit || 0);
  const typeStr = (type || '').trim();

  // Monthly Rent (Wolse)
  if (typeStr === '월세' || typeStr === 'Monthly Rent') {
    if (d > 0) return `${d.toLocaleString()} / ${p.toLocaleString()} 만원`;
    return `${p.toLocaleString()} 만원 (월세)`;
  }

  // Jeonse or Sale
  return `${p.toLocaleString()} 만원`;
}

function bindPhoneBtn(listing) {
  if (!phoneBtn) return;

  // Use listing's contact phone, fallback to general number
  const contactPhone = listing.contact_phone || '0507-1402-5055';
  const telLink = `tel:${contactPhone.replace(/[^0-9]/g, '')}`; // Remove non-numeric chars for tel: link

  // Set the href dynamically
  phoneBtn.href = telLink;
  phoneBtn.setAttribute('data-phone', contactPhone);

  phoneBtn.addEventListener('click', (e) => {
    // If desktop (width > 768px), show alert instead of calling
    if (window.innerWidth > 768) {
      e.preventDefault();
      alert(`전화 문의: ${contactPhone}\n(모바일에서는 바로 전화가 연결됩니다)`);
    }
  });
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
      email: formData.get('email') || '', // Optional now
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
