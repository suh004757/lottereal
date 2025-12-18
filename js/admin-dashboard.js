import {
  createListing,
  uploadImage,
  getDashboardStats,
  getRecentActivities,
  listListingsAdmin,
  listInquiriesAdmin,
  updateInquiryStatus
} from './services/backendAdapter.js';

// DOM hooks
const statsEls = {
  listings: document.querySelector('[data-stat-listings]'),
  new7d: document.querySelector('[data-stat-new7d]'),
  inquiries: document.querySelector('[data-stat-inquiries]'),
  unread: document.querySelector('[data-stat-unread]')
};
const recentContainer = document.querySelector('[data-recent-activities]');
const listingsTbody = document.querySelector('[data-admin-listings]');
const inquiriesTbody = document.querySelector('[data-admin-inquiries]');

// Property modal / form
const propertyModal = document.getElementById('propertyModal');
const addPropertyBtn = document.getElementById('addPropertyBtn');
const closeModalBtn = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const modalOverlay = document.querySelector('.admin-modal__overlay');
const propertyForm = document.getElementById('propertyForm');
const transactionTypeSelect = document.querySelector('select[name="transactionType"]');
const depositField = document.getElementById('depositField');
const propertyImagesInput = document.getElementById('propertyImages');
const imagePreviewContainer = document.getElementById('imagePreview');
let uploadedImages = [];

document.addEventListener('DOMContentLoaded', () => {
  bindNav();
  bindModal();
  bindPropertyForm();
  loadStats();
  loadRecent();
  loadListingsAdmin();
  loadInquiriesAdmin();
});

// Navigation (if tabs exist)
function bindNav() {
  const navItems = document.querySelectorAll('.admin-nav__item');
  const sections = document.querySelectorAll('.admin-section');
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach((n) => n.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));
      item.classList.add('active');
      const sectionId = item.getAttribute('data-section') + '-section';
      const target = document.getElementById(sectionId);
      if (target) target.classList.add('active');
    });
  });
}

async function loadStats() {
  try {
    const stats = await getDashboardStats();
    if (statsEls.listings) statsEls.listings.textContent = (stats.totalListings || 0).toLocaleString();
    if (statsEls.new7d) statsEls.new7d.textContent = (stats.newListings7d || 0).toLocaleString();
    if (statsEls.inquiries) statsEls.inquiries.textContent = (stats.totalInquiries || 0).toLocaleString();
    if (statsEls.unread) statsEls.unread.textContent = (stats.unreadInquiries || 0).toLocaleString();
  } catch (err) {
    console.error('Dashboard stats error', err);
  }
}

async function loadRecent() {
  if (!recentContainer) return;
  recentContainer.innerHTML = '<li class="admin-activity">불러오는 중...</li>';
  try {
    const data = await getRecentActivities(20);
    if (!data || data.length === 0) {
      recentContainer.innerHTML = '<li class="admin-activity">최근 활동이 없습니다.</li>';
      return;
    }
    recentContainer.innerHTML = '';
    data.forEach((a) => {
      const li = document.createElement('li');
      li.className = 'admin-activity';
      li.textContent = `[${a.type || 'listing'}] ${a.title || ''} - ${new Date(a.created_at).toLocaleString()}`;
      recentContainer.appendChild(li);
    });
  } catch (err) {
    console.error('최근 활동 로드 실패', err);
    recentContainer.innerHTML = '<li class="admin-activity">최근 활동을 불러오지 못했습니다.</li>';
  }
}

async function loadListingsAdmin() {
  if (!listingsTbody) return;
  listingsTbody.innerHTML = '<tr><td colspan="5">불러오는 중...</td></tr>';
  try {
    const data = await listListingsAdmin({ page: 1, pageSize: 50 });
    if (!data || data.length === 0) {
      listingsTbody.innerHTML = '<tr><td colspan="5">매물이 없습니다.</td></tr>';
      return;
    }
    listingsTbody.innerHTML = '';
    data.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${item.title || ''}</td>
        <td>${item.property_type || ''}</td>
        <td>${item.address || ''}</td>
        <td>${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</td>
      `;
      listingsTbody.appendChild(tr);
    });
  } catch (err) {
    console.error('매물 관리 로드 실패', err);
    listingsTbody.innerHTML = '<tr><td colspan="5">매물 불러오기 실패했습니다.</td></tr>';
  }
}

async function loadInquiriesAdmin() {
  if (!inquiriesTbody) return;
  inquiriesTbody.innerHTML = '<tr><td colspan="7">불러오는 중...</td></tr>';
  try {
    const data = await listInquiriesAdmin({ page: 1, pageSize: 50 });
    if (!data || data.length === 0) {
      inquiriesTbody.innerHTML = '<tr><td colspan="7">문의가 없습니다.</td></tr>';
      return;
    }
    inquiriesTbody.innerHTML = '';
    data.forEach((inq, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${inq.listing_title || ''}</td>
        <td>${inq.name || ''}</td>
        <td>${inq.phone || ''}</td>
        <td>${inq.status || ''}</td>
        <td>${inq.created_at ? new Date(inq.created_at).toLocaleString() : ''}</td>
        <td><button class="admin-btn admin-btn--ghost" data-inquiry="${inq.id}" data-status="${inq.status === 'read' ? 'unread' : 'read'}">${inq.status === 'read' ? '안읽음으로' : '읽음으로'}</button></td>
      `;
      inquiriesTbody.appendChild(tr);
    });
    inquiriesTbody.querySelectorAll('[data-inquiry]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-inquiry');
        const nextStatus = btn.getAttribute('data-status');
        await updateInquiryStatus(id, nextStatus);
        loadInquiriesAdmin();
        loadRecent();
      });
    });
  } catch (err) {
    console.error('문의 관리 로드 실패', err);
    inquiriesTbody.innerHTML = '<tr><td colspan="7">문의 불러오기 실패했습니다.</td></tr>';
  }
}

function bindModal() {
  if (addPropertyBtn) addPropertyBtn.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && propertyModal?.classList.contains('active')) closeModal();
  });

  if (transactionTypeSelect && depositField) {
    transactionTypeSelect.addEventListener('change', (e) => {
      const value = e.target.value || '';
      depositField.style.display = value === '전세' ? 'block' : 'none';
    });
  }

  if (propertyImagesInput) {
    propertyImagesInput.addEventListener('change', onImagesSelected);
  }
}

function openModal() {
  propertyModal?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  propertyModal?.classList.remove('active');
  document.body.style.overflow = '';
  propertyForm?.reset();
  uploadedImages = [];
  renderImagePreviews();
}

async function onImagesSelected(e) {
  const files = Array.from(e.target.files || []);
  if (files.length + uploadedImages.length > 10) {
    alert('최대 10개의 이미지만 업로드할 수 있습니다.');
    return;
  }
  if (imagePreviewContainer) {
    imagePreviewContainer.innerHTML = '<div style="color: var(--admin-muted); padding: 12px;">이미지 처리 중...</div>';
  }
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name} (이)가 5MB를 초과합니다.`);
      continue;
    }
    const resizedFile = await resizeImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      uploadedImages.push({
        file: resizedFile,
        preview: ev.target.result,
        originalSize: file.size,
        resizedSize: resizedFile.size
      });
      renderImagePreviews();
    };
    reader.readAsDataURL(resizedFile);
  }
}

function renderImagePreviews() {
  if (!imagePreviewContainer) return;
  imagePreviewContainer.innerHTML = '';
  uploadedImages.forEach((img, index) => {
    const item = document.createElement('div');
    item.className = 'admin-image-preview__item';
    const imgEl = document.createElement('img');
    imgEl.src = img.preview;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'admin-image-preview__remove';
    removeBtn.innerHTML = '×';
    removeBtn.type = 'button';
    removeBtn.onclick = () => {
      uploadedImages.splice(index, 1);
      renderImagePreviews();
    };
    const sizeEl = document.createElement('div');
    sizeEl.className = 'admin-image-preview__size';
    sizeEl.textContent = formatFileSize(img.resizedSize);
    item.appendChild(imgEl);
    item.appendChild(removeBtn);
    item.appendChild(sizeEl);
    imagePreviewContainer.appendChild(item);
  });
}

function bindPropertyForm() {
  if (!propertyForm) return;
  propertyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(propertyForm);
    formData.delete('images');
    const propertyData = Object.fromEntries(formData.entries());

    try {
      togglePropertyFormDisabled(true);
      const imageUrls = await uploadImagesToSupabase(uploadedImages);
      const payload = {
        title: propertyData.title || propertyData.name || '관리자 등록 매물',
        description: propertyData.description || '',
        price: propertyData.price ? Number(propertyData.price) : null,
        currency: 'KRW',
        location: {
          address: propertyData.address || '',
          city: propertyData.city || 'Seoul',
          district: propertyData.district || 'Songpa'
        },
        propertyType: propertyData.propertyType || propertyData.transactionType || '',
        images: imageUrls,
        contact: {
          name: propertyData.contactName || '',
          phone: propertyData.contactPhone || '',
          email: propertyData.contactEmail || ''
        },
        metadata: {
          source: 'admin-dashboard',
          submittedAt: new Date().toISOString()
        }
      };

      await createListing(payload);
      alert(`매물이 등록되었습니다. (이미지 ${imageUrls.length}개 포함)`);
      uploadedImages = [];
      renderImagePreviews();
      closeModal();
      loadStats();
      loadRecent();
      loadListingsAdmin();
    } catch (err) {
      console.error('매물 등록 실패:', err);
      alert('매물 등록 중 오류가 발생했습니다.');
    } finally {
      togglePropertyFormDisabled(false);
    }
  });
}

async function uploadImagesToSupabase(images) {
  if (!images || images.length === 0) return [];
  const urls = [];
  for (const img of images) {
    const res = await uploadImage(img.file);
    if (res?.url) urls.push(res.url);
  }
  return urls;
}

function togglePropertyFormDisabled(isDisabled) {
  const submit = propertyForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = isDisabled;
}

// Utilities
async function resizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
