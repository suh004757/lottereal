import {
  createListing,
  uploadImage,
  updateListing,
  deleteListing,
  getDashboardStats,
  getRecentActivities,
  listListingsAdmin,
  listInquiriesAdmin,
  updateInquiryStatus
} from './services/backendAdapter.js';
import { useAuth } from './hooks/useAuth.js';

// DOM hooks
const statsEls = {
  listings: document.querySelector('[data-stat-listings]'),
  new7d: document.querySelector('[data-stat-new7d]'),
  inquiries: document.querySelector('[data-stat-inquiries]'),
  unread: document.querySelector('[data-stat-unread]')
};
const serviceStatusEl = document.querySelector('[data-service-status]');
const recentContainer = document.querySelector('[data-recent-activities]');
const listingsTbody = document.querySelector('[data-admin-listings]');
const inquiriesTbody = document.querySelector('[data-admin-inquiries]');
const logoutBtn = document.getElementById('logoutBtn');

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

// Inquiry detail modal
const inquiryModal = document.getElementById('inquiryModal');
const closeInquiryModalBtn = document.getElementById('closeInquiryModal');
const closeInquiryModalFooterBtn = document.getElementById('closeInquiryModalFooter');
const inquiryOverlay = inquiryModal?.querySelector('.admin-modal__overlay');
const inquiryFields = {
  title: document.querySelector('[data-inquiry-title]'),
  name: document.querySelector('[data-inquiry-name]'),
  phone: document.querySelector('[data-inquiry-phone]'),
  email: document.querySelector('[data-inquiry-email]'),
  status: document.querySelector('[data-inquiry-status]'),
  created: document.querySelector('[data-inquiry-created]'),
  message: document.querySelector('[data-inquiry-message]')
};

let uploadedImages = [];
let existingImages = [];
let editingId = null;
const auth = useAuth();

document.addEventListener('DOMContentLoaded', () => {
  bindNav();
  bindModal();
  bindPropertyForm();
  bindInquiryModal();
  bindLogout();
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

function setServiceStatus(ok, context) {
  if (!serviceStatusEl) return;
  const ts = new Date();
  const kst = ts.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  if (ok) {
    serviceStatusEl.textContent = `연결 정상 · 업데이트 ${kst}`;
    serviceStatusEl.style.color = '#10b981';
    serviceStatusEl.style.borderColor = 'rgba(16,185,129,0.3)';
    serviceStatusEl.style.background = 'rgba(16,185,129,0.12)';
  } else {
    serviceStatusEl.textContent = `연결 오류 · ${context || ''}`;
    serviceStatusEl.style.color = '#f97316';
    serviceStatusEl.style.borderColor = 'rgba(249,115,22,0.3)';
    serviceStatusEl.style.background = 'rgba(249,115,22,0.12)';
  }
}

async function loadStats() {
  try {
    const stats = await getDashboardStats();
    if (statsEls.listings) statsEls.listings.textContent = (stats.totalListings || 0).toLocaleString();
    if (statsEls.new7d) statsEls.new7d.textContent = (stats.newListings7d || 0).toLocaleString();
    if (statsEls.inquiries) statsEls.inquiries.textContent = (stats.totalInquiries || 0).toLocaleString();
    if (statsEls.unread) statsEls.unread.textContent = (stats.unreadInquiries || 0).toLocaleString();
    setServiceStatus(true);
  } catch (err) {
    console.error('Dashboard stats error', err);
    setServiceStatus(false, '대시보드 데이터 로드 실패');
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
      li.textContent = `[${a.type || 'listing'}] ${a.title || ''} - ${formatKst(a.created_at)}`;
      recentContainer.appendChild(li);
    });
  } catch (err) {
    console.error('최근 활동 로드 실패', err);
    recentContainer.innerHTML = '<li class="admin-activity">최근 활동을 불러오지 못했습니다.</li>';
  }
}

async function loadListingsAdmin() {
  if (!listingsTbody) return;
  listingsTbody.innerHTML = '<tr><td colspan="6">불러오는 중...</td></tr>';
  try {
    const data = await listListingsAdmin({ page: 1, pageSize: 50 });
    if (!data || data.length === 0) {
      listingsTbody.innerHTML = '<tr><td colspan="6">매물이 없습니다.</td></tr>';
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
        <td>${formatKst(item.created_at) || ''}</td>
        <td>
          <div class="admin-table-actions">
            <button class="admin-icon-btn" data-edit="${item.id}" title="수정">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="admin-icon-btn danger" data-delete="${item.id}" title="삭제">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      `;
      listingsTbody.appendChild(tr);
    });

    listingsTbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit');
        const item = data.find((d) => `${d.id}` === `${id}`);
        if (item) openModal(item);
      });
    });

    listingsTbody.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (!confirm('이 매물을 삭제할까요?')) return;
        try {
          await deleteListing(id);
          loadStats();
          loadRecent();
          loadListingsAdmin();
        } catch (err) {
          console.error('삭제 실패', err);
          alert('삭제 중 오류가 발생했습니다.');
        }
      });
    });
  } catch (err) {
    console.error('매물 관리 로드 실패', err);
    listingsTbody.innerHTML = '<tr><td colspan="6">매물 불러오기 실패했습니다.</td></tr>';
  }
}

async function loadInquiriesAdmin() {
  if (!inquiriesTbody) return;
  inquiriesTbody.innerHTML = '<tr><td colspan="8">불러오는 중...</td></tr>';
  try {
    const data = await listInquiriesAdmin({ page: 1, pageSize: 50 });
    if (!data || data.length === 0) {
      inquiriesTbody.innerHTML = '<tr><td colspan="8">문의가 없습니다.</td></tr>';
      return;
    }
    inquiriesTbody.innerHTML = '';
    data.forEach((inq, idx) => {
      const tr = document.createElement('tr');
      if ((inq.status || '').toLowerCase() === 'unread') {
        tr.classList.add('admin-inquiry--unread');
      }
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${inq.listing_title || ''}</td>
        <td>${inq.name || ''}</td>
        <td>${inq.phone || ''}</td>
        <td>${inq.message || ''}</td>
        <td>${renderStatusBadge(inq.status)}</td>
        <td>${formatKst(inq.created_at) || ''}</td>
        <td>
          <div class="admin-table-actions">
            <button class="admin-btn admin-btn--ghost" data-inquiry="${inq.id}" data-status="${inq.status === 'read' ? 'unread' : 'read'}">${inq.status === 'read' ? '안읽음으로' : '읽음으로'}</button>
            <button class="admin-btn admin-btn--ghost" data-share-inquiry="${inq.id}">공유</button>
          </div>
        </td>
      `;
      tr.addEventListener('click', (e) => {
        // Avoid interfering with inner buttons
        if (e.target.closest('button')) return;
        openInquiryModal(inq);
      });
      inquiriesTbody.appendChild(tr);
    });
    inquiriesTbody.querySelectorAll('[data-inquiry]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-inquiry');
        const nextStatus = btn.getAttribute('data-status');
        await updateInquiryStatus(id, nextStatus);
        loadInquiriesAdmin();
        loadRecent();
      });
    });
    inquiriesTbody.querySelectorAll('[data-share-inquiry]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-share-inquiry');
        const inq = data.find((x) => `${x.id}` === `${id}`);
        if (!inq) return;
        const text = [
          `Listing: ${inq.listing_title || '-'}`,
          `Name: ${inq.name || '-'}`,
          `Phone: ${inq.phone || '-'}`,
          `Email: ${inq.email || '-'}`,
          `Message: ${inq.message || '-'}`,
          `Created: ${formatKst(inq.created_at) || '-'}`
        ].join('\n');
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            alert('문의 내용을 클립보드에 복사했습니다.');
          } else {
            prompt('아래 내용을 복사하세요:', text);
          }
        } catch (err) {
          console.error('클립보드 복사 실패', err);
          prompt('아래 내용을 복사하세요:', text);
        }
      });
    });
  } catch (err) {
    console.error('문의 관리 로드 실패', err);
    inquiriesTbody.innerHTML = '<tr><td colspan="8">문의 불러오기 실패했습니다.</td></tr>';
  }
}

function bindModal() {
  if (addPropertyBtn) addPropertyBtn.addEventListener('click', () => openModal());
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

function bindInquiryModal() {
  const closeFns = () => closeInquiryModal();
  if (closeInquiryModalBtn) closeInquiryModalBtn.addEventListener('click', closeFns);
  if (closeInquiryModalFooterBtn) closeInquiryModalFooterBtn.addEventListener('click', closeFns);
  if (inquiryOverlay) inquiryOverlay.addEventListener('click', closeFns);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inquiryModal?.classList.contains('active')) closeInquiryModal();
  });
}

function bindLogout() {
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      window.location.href = './login.html';
    }
  });
}

function openModal(item) {
  editingId = item?.id || null;
  if (editingId) {
    document.getElementById('modalTitle').textContent = '매물 수정';
    fillForm(item);
  } else {
    document.getElementById('modalTitle').textContent = '매물 추가';
    propertyForm?.reset();
    existingImages = [];
    uploadedImages = [];
    renderImagePreviews();
  }
  propertyModal?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  propertyModal?.classList.remove('active');
  document.body.style.overflow = '';
  propertyForm?.reset();
  uploadedImages = [];
  existingImages = [];
  editingId = null;
  renderImagePreviews();
}

function openInquiryModal(inq) {
  if (!inquiryModal) return;
  inquiryFields.title.textContent = inq.listing_title || '-';
  inquiryFields.name.textContent = inq.name || '-';
  inquiryFields.phone.textContent = inq.phone || '-';
  inquiryFields.email.textContent = inq.email || '-';
  inquiryFields.status.innerHTML = renderStatusBadge(inq.status);
  inquiryFields.created.textContent = formatKst(inq.created_at) || '-';
  inquiryFields.message.textContent = inq.message || '-';
  inquiryModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeInquiryModal() {
  inquiryModal?.classList.remove('active');
  document.body.style.overflow = '';
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
  if (existingImages.length) {
    existingImages.forEach((url) => {
      const item = document.createElement('div');
      item.className = 'admin-image-preview__item';
      const imgEl = document.createElement('img');
      imgEl.src = url;
      const keepEl = document.createElement('div');
      keepEl.className = 'admin-image-preview__size';
      keepEl.textContent = '기존 이미지';
      item.appendChild(imgEl);
      item.appendChild(keepEl);
      imagePreviewContainer.appendChild(item);
    });
  }
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

      if (editingId) {
        payload.images = [...(existingImages || []), ...imageUrls];
        await updateListing(editingId, payload);
        alert('매물이 수정되었습니다.');
      } else {
        payload.images = imageUrls;
        await createListing(payload);
        alert(`매물이 등록되었습니다. (이미지 ${imageUrls.length}개 포함)`);
      }
      uploadedImages = [];
      existingImages = [];
      editingId = null;
      renderImagePreviews();
      closeModal();
      loadStats();
      loadRecent();
      loadListingsAdmin();
    } catch (err) {
      console.error('매물 저장 실패:', err);
      alert('매물 저장 중 오류가 발생했습니다.');
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

function renderStatusBadge(status) {
  const normalized = (status || '').toLowerCase();
  const label = normalized === 'read' ? '읽음' : '미확인';
  const cls = normalized === 'read' ? 'admin-status-badge' : 'admin-status-badge pending';
  return `<span class="${cls}">${label}</span>`;
}

function fillForm(item) {
  if (!propertyForm) return;
  propertyForm.querySelector('[name="title"]').value = item.title || '';
  propertyForm.querySelector('[name="transactionType"]').value = item.property_type || '';
  propertyForm.querySelector('[name="price"]').value = item.price || '';
  propertyForm.querySelector('[name="address"]').value = item.address || '';
  propertyForm.querySelector('[name="city"]').value = item.city || '';
  propertyForm.querySelector('[name="district"]').value = item.district || '';
  propertyForm.querySelector('[name="contactName"]').value = item.contact_name || '';
  propertyForm.querySelector('[name="contactPhone"]').value = item.contact_phone || '';
  propertyForm.querySelector('[name="contactEmail"]').value = item.contact_email || '';
  propertyForm.querySelector('[name="description"]').value = item.description || '';
  existingImages = Array.isArray(item.images) ? item.images : [];
  renderImagePreviews();
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

function formatKst(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '';
  }
}
