/**
 * Admin Dashboard - 관리자 대시보드
 * 매물 관리, 문의 관리, 통계 조회 기능을 제공하는 관리자 대시보드입니다.
 *
 * 주요 기능:
 * - 대시보드 통계 표시 (총 매물 수, 신규 매물, 문의 수)
 * - 매물 CRUD (생성, 조회, 수정, 삭제)
 * - 문의 관리 및 상태 변경
 * - 이미지 업로드 및 자동 리사이징 (최대 1920x1080, JPEG 85% 품질)
 * - 실시간 서비스 상태 모니터링
 *
 * @module admin-dashboard
 */

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
import { signOutAdmin, getCurrentSessionUser } from './services/authService.js';

// ============================================
// DOM 요소 참조
// ============================================

/** @type {Object} 통계 표시 요소들 */
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

// ============================================
// 전역 상태 변수
// ============================================

/** @type {Array} 업로드된 이미지 배열 (미리보기 포함) */
let uploadedImages = [];

/** @type {Array<string>} 기존 이미지 URL 배열 (수정 시 사용) */
let existingImages = [];

/** @type {string|null} 현재 편집 중인 매물 ID */
let editingId = null;

/** @type {Object} 인증 객체 */
let currentAdmin = null;

// ============================================
// 초기화
// ============================================

/**
 * DOM이 로드되면 초기화를 실행합니다.
 * 모든 이벤트 리스너를 바인딩하고 초기 데이터를 로드합니다.
 */
document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
});

async function initAdminDashboard() {
  try {
    currentAdmin = await getCurrentSessionUser();
    if (!currentAdmin) {
      redirectToLogin();
      return;
    }
    setAdminIdentity(currentAdmin);
    bindNav();
    bindModal();
    bindPropertyForm();
    bindInquiryModal();
    bindLogout();
    loadStats();
    loadRecent();
    loadListingsAdmin();
    loadInquiriesAdmin();
  } catch (err) {
    console.error('[Admin] Failed to initialize dashboard:', err);
    redirectToLogin();
  }
}

function redirectToLogin() {
  window.location.href = './login.html';
}

function setAdminIdentity(user) {
  const userNameEl = document.getElementById('userName');
  if (!userNameEl) return;
  userNameEl.textContent = user?.email || user?.user_metadata?.name || 'Admin';
}

// ============================================
// 네비게이션 관련
// ============================================

/**
 * 대시보드 네비게이션 탭을 바인딩합니다.
 * 탭 클릭 시 해당 섹션을 활성화합니다.
 */
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

// ============================================
// 서비스 상태 관련
// ============================================

/**
 * 서비스 연결 상태를 표시합니다.
 * 성공 시 녹색, 실패 시 주황색으로 표시됩니다.
 *
 * @param {boolean} ok - 연결 성공 여부
 * @param {string} [context=''] - 오류 컨텍스트 (실패 시 표시)
 */
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

// ============================================
// 대시보드 데이터 로딩
// ============================================

/**
 * 대시보드 통계를 로드하고 표시합니다.
 * 총 매물 수, 7일 내 신규 매물, 총 문의, 미확인 문의 등의 통계를 가져옵니다.
 *
 * @async
 * @throws {Error} 통계 로드 실패 시
 */
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

/**
 * 최근 활동 목록을 로드하고 표시합니다.
 * 최근 20개의 활동(매물 등록, 문의 등)을 시간 역순으로 표시합니다.
 *
 * @async
 * @throws {Error} 활동 로드 실패 시
 */
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

// ============================================
// 매물 관리
// ============================================

/**
 * 관리자 매물 리스트를 로드하고 테이블에 표시합니다.
 * 수정/삭제 버튼 이벤트도 함께 바인딩합니다.
 *
 * @async
 * @throws {Error} 매물 로드 실패 시
 */
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

// ============================================
// 문의 관리
// ============================================

/**
 * 관리자 문의 리스트를 로드하고 테이블에 표시합니다.
 * 상태 변경, 공유 버튼 이벤트도 함께 바인딩합니다.
 *
 * @async
 * @throws {Error} 문의 로드 실패 시
 */
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

// ============================================
// 매물 모달 관련
// ============================================

/**
 * 매물 모달 관련 이벤트를 바인딩합니다.
 * - 모달 열기/닫기
 * - 거래 유형에 따른 보증금 필드 표시/숨김
 * - 이미지 선택 이벤트
 */
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
      depositField.style.display = (value === '전세' || value === '월세') ? 'block' : 'none';
    });
  }

  if (propertyImagesInput) {
    propertyImagesInput.addEventListener('change', onImagesSelected);
  }
}

/**
 * 문의 모달 이벤트를 바인딩합니다.
 * ESC 키로 닫기, 오버레이 클릭으로 닫기 등을 설정합니다.
 */
function bindInquiryModal() {
  const closeFns = () => closeInquiryModal();
  if (closeInquiryModalBtn) closeInquiryModalBtn.addEventListener('click', closeFns);
  if (closeInquiryModalFooterBtn) closeInquiryModalFooterBtn.addEventListener('click', closeFns);
  if (inquiryOverlay) inquiryOverlay.addEventListener('click', closeFns);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inquiryModal?.classList.contains('active')) closeInquiryModal();
  });
}

/**
 * 로그아웃 버튼 이벤트를 바인딩합니다.
 * 로그아웃 성공 후 로그인 페이지로 리다이렉트합니다.
 */
function bindLogout() {
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOutAdmin();
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      window.location.href = './login.html';
    }
  });
}

/**
 * 매물 모달을 엽니다.
 * @param {Object} [item] - 편집할 매물 데이터 (없으면 신규 생성 모드)
 * @param {string} item.id - 매물 ID
 * @param {string} item.title - 매물 제목
 * @param {Array<string>} item.images - 이미지 URL 배열
 */
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

/**
 * 매물 모달을 닫고 폼 상태를 초기화합니다.
 */
function closeModal() {
  propertyModal?.classList.remove('active');
  document.body.style.overflow = '';
  propertyForm?.reset();
  uploadedImages = [];
  existingImages = [];
  editingId = null;
  renderImagePreviews();
}

/**
 * 문의 상세 모달을 엽니다.
 * @param {Object} inq - 문의 데이터 객체
 * @param {string} inq.listing_title - 매물 제목
 * @param {string} inq.name - 문의자 이름
 * @param {string} inq.phone - 전화번호
 * @param {string} inq.email - 이메일
 * @param {string} inq.status - 문의 상태 ('read' | 'unread')
 * @param {string} inq.message - 문의 내용
 * @param {string} inq.created_at - 생성 시간 (ISO 형식)
 */
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

/**
 * 문의 모달을 닫습니다.
 */
function closeInquiryModal() {
  inquiryModal?.classList.remove('active');
  document.body.style.overflow = '';
}

// ============================================
// 이미지 처리
// ============================================

/**
 * 이미지 파일이 선택되었을 때 호출됩니다.
 * 최대 10개까지 허용하며, 5MB 초과 파일은 거부합니다.
 * 모든 이미지는 자동으로 리사이징됩니다.
 *
 * @async
 * @param {Event} e - 파일 입력 이벤트
 */
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

/**
 * 이미지 미리보기를 렌더링합니다.
 * 기존 이미지와 새로 업로드된 이미지를 모두 표시하며,
 * 각 이미지에 삭제 버튼이 포함됩니다.
 */
function renderImagePreviews() {
  if (!imagePreviewContainer) return;
  imagePreviewContainer.innerHTML = '';
  if (existingImages.length) {
    existingImages.forEach((url, index) => {
      const item = document.createElement('div');
      item.className = 'admin-image-preview__item';
      const imgEl = document.createElement('img');
      imgEl.src = url;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'admin-image-preview__remove';
      removeBtn.innerHTML = '×';
      removeBtn.type = 'button';
      removeBtn.onclick = () => {
        existingImages.splice(index, 1);
        renderImagePreviews();
      };
      const keepEl = document.createElement('div');
      keepEl.className = 'admin-image-preview__size';
      keepEl.textContent = '기존 이미지';
      item.appendChild(imgEl);
      item.appendChild(removeBtn);
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

// ============================================
// 매물 폼 처리
// ============================================

/**
 * 매물 폼 제출 이벤트를 바인딩합니다.
 * 폼 데이터를 수집하고 이미지를 업로드한 후 백엔드에 전송합니다.
 */
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
          submittedAt: new Date().toISOString(),
          deposit: propertyData.deposit ? Number(propertyData.deposit) : 0
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

/**
 * 이미지를 Supabase 스토리지에 업로드합니다.
 *
 * @async
 * @param {Array<Object>} images - 업로드할 이미지 배열
 * @param {File} images[].file - 이미지 파일 객체
 * @returns {Promise<Array<string>>} 업로드된 이미지 URL 배열
 */
async function uploadImagesToSupabase(images) {
  if (!images || images.length === 0) return [];
  const urls = [];
  for (const img of images) {
    const res = await uploadImage(img.file);
    if (res?.url) urls.push(res.url);
  }
  return urls;
}

/**
 * 매물 폼의 활성화 상태를 토글합니다.
 * 제출 중에는 폼을 비활성화하여 중복 제출을 방지합니다.
 *
 * @param {boolean} isDisabled - 비활성화 여부
 */
function togglePropertyFormDisabled(isDisabled) {
  const submit = propertyForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = isDisabled;
}

/**
 * 문의 상태 배지 HTML을 렌더링합니다.
 *
 * @param {string} status - 문의 상태 ('read' | 'unread')
 * @returns {string} HTML 문자열
 */
function renderStatusBadge(status) {
  const normalized = (status || '').toLowerCase();
  const label = normalized === 'read' ? '읽음' : '미확인';
  const cls = normalized === 'read' ? 'admin-status-badge' : 'admin-status-badge pending';
  return `<span class="${cls}">${label}</span>`;
}

/**
 * 매물 수정 시 폼을 데이터로 채웁니다.
 *
 * @param {Object} item - 매물 데이터 객체
 * @param {string} item.title - 매물 제목
 * @param {string} item.property_type - 부동산 타입
 * @param {number} item.price - 가격
 * @param {string} item.address - 주소
 * @param {Array<string>} item.images - 이미지 URL 배열
 * @param {Object} item.metadata - 메타데이터
 * @param {number} item.metadata.deposit - 보증금
 */
function fillForm(item) {
  if (!propertyForm) return;
  propertyForm.querySelector('[name="title"]').value = item.title || '';
  propertyForm.querySelector('[name="transactionType"]').value = item.property_type || '';
  propertyForm.querySelector('[name="price"]').value = item.price || '';
  // Populate deposit if available in metadata
  const depositVal = item.metadata?.deposit || '';
  if (propertyForm.querySelector('[name="deposit"]')) {
    propertyForm.querySelector('[name="deposit"]').value = depositVal;
  }
  // Trigger change to show/hide deposit field
  const event = new Event('change');
  propertyForm.querySelector('[name="transactionType"]').dispatchEvent(event);
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

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 이미지를 캔버스를 사용하여 리사이징합니다.
 * 가로세로 비율을 유지하며 최대 크기 이내로 조정합니다.
 *
 * @async
 * @param {File} file - 원본 이미지 파일
 * @param {number} [maxWidth=1920] - 최대 너비
 * @param {number} [maxHeight=1080] - 최대 높이
 * @param {number} [quality=0.85] - JPEG 압축 품질 (0-1)
 * @returns {Promise<File>} 리사이징된 이미지 파일
 */
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

/**
 * 파일 크기를 사람이 읽을 수 있는 형식으로 포맷팅합니다.
 *
 * @param {number} bytes - 바이트 크기
 * @returns {string} 포맷팅된 문자열 (예: '1.5 MB')
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 날짜를 한국 시간대(KST)로 포맷팅합니다.
 *
 * @param {string} ts - ISO 8601 형식의 타임스탬프
 * @returns {string} 포맷팅된 날짜 문자열
 */
function formatKst(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return '';
  }
}
