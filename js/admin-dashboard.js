import { createListing, uploadImage } from './services/backendAdapter.js';
import { getSupabaseClient } from './config/supabaseConfig.js';

// Admin Dashboard JavaScript
// Handles navigation, session management, and interactive features

// Load analytics data for dashboard stats
function updateDashboardStats() {
    const analyticsKey = 'lottereal_analytics';
    const stored = localStorage.getItem(analyticsKey);

    if (stored) {
        const analytics = JSON.parse(stored);
        const now = new Date();

        const weeklyVisits = analytics.visits ? analytics.visits.filter(visit => {
            const visitDate = new Date(visit.timestamp);
            return (now - visitDate) / (1000 * 60 * 60 * 24) < 7;
        }).length : 0;

        const lastWeekVisits = analytics.visits ? analytics.visits.filter(visit => {
            const visitDate = new Date(visit.timestamp);
            const daysAgo = (now - visitDate) / (1000 * 60 * 60 * 24);
            return daysAgo >= 7 && daysAgo < 14;
        }).length : 0;

        const growth = lastWeekVisits > 0
            ? Math.round(((weeklyVisits - lastWeekVisits) / lastWeekVisits) * 1000) / 10
            : 0;

        const visitorValueEl = document.querySelector('.admin-stat-card:nth-child(3) .admin-stat-value');
        const visitorChangeEl = document.querySelector('.admin-stat-card:nth-child(3) .admin-stat-change');

        if (visitorValueEl) visitorValueEl.textContent = weeklyVisits.toLocaleString();
        if (visitorChangeEl) {
            const sign = growth >= 0 ? '+' : '';
            visitorChangeEl.textContent = `${sign}${growth}%`;
            visitorChangeEl.className = 'admin-stat-change' + (growth >= 0 ? ' positive' : '');
        }
    }
}

// Session Management
let sessionTimeout = 30 * 60; // seconds
let sessionTimer;

function updateSessionTimer() {
    const minutes = Math.floor(sessionTimeout / 60);
    const seconds = sessionTimeout % 60;
    const timerElement = document.getElementById('sessionTimer');

    if (timerElement) {
        timerElement.textContent = `세션: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (sessionTimeout < 300) {
            timerElement.style.background = 'rgba(239, 68, 68, 0.12)';
            timerElement.style.color = '#fecdd3';
        }
    }
    sessionTimeout--;
    if (sessionTimeout < 0) {
        clearInterval(sessionTimer);
        handleSessionExpired();
    }
}

function handleSessionExpired() {
    alert('세션이 만료되었습니다. 다시 로그인해주세요.');
    window.location.href = '/admin/login.html';
}

function resetSessionTimer() {
    sessionTimeout = 30 * 60;
}

// ---- Inquiries (문의) 관리 ----
const INQUIRY_STORAGE_KEY = 'lottereal_inquiries';

function loadInquiries() {
    try {
        return JSON.parse(localStorage.getItem(INQUIRY_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function saveInquiries(list) {
    localStorage.setItem(INQUIRY_STORAGE_KEY, JSON.stringify(list));
}

function renderInquiries() {
    const tbody = document.querySelector('[data-inquiry-table]');
    const badge = document.querySelector('[data-inquiry-unread-count]');
    const inquiries = loadInquiries().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (badge) {
        const unread = inquiries.filter((i) => i.status !== 'read').length;
        badge.textContent = unread;
    }

    if (!tbody) return;
    tbody.innerHTML = '';

    inquiries.forEach((inq, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${inq.listingTitle || '-'}</td>
            <td>${inq.name || '-'}</td>
            <td>${inq.phone || '-'}</td>
            <td>${inq.email || '-'}</td>
            <td>${inq.message || '-'}</td>
            <td>${inq.status === 'read' ? '읽음' : '안읽음'}</td>
            <td>${inq.createdAt ? new Date(inq.createdAt).toLocaleString() : '-'}</td>
            <td>
                <button class="admin-btn admin-btn--ghost" data-mark-read="${inq.id}">${inq.status === 'read' ? '안읽음' : '읽음'} 처리</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-mark-read]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-mark-read');
            const list = loadInquiries();
            const found = list.find((i) => i.id === id);
            if (found) {
                found.status = found.status === 'read' ? 'unread' : 'read';
                saveInquiries(list);
                renderInquiries();
            }
        });
    });
}

function initInquiries() {
    renderInquiries();
}

// Modal Handling
const propertyModal = document.getElementById('propertyModal');
const addPropertyBtn = document.getElementById('addPropertyBtn');
const closeModalBtn = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const modalOverlay = document.querySelector('.admin-modal__overlay');
const propertyForm = document.getElementById('propertyForm');
const transactionTypeSelect = document.querySelector('select[name="transactionType"]');
const depositField = document.getElementById('depositField');

// Open modal
if (addPropertyBtn) {
    addPropertyBtn.addEventListener('click', () => {
        propertyModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

function closeModal() {
    propertyModal.classList.remove('active');
    document.body.style.overflow = '';
    propertyForm.reset();
    uploadedImages = [];
    renderImagePreviews();
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && propertyModal.classList.contains('active')) {
        closeModal();
    }
});

// Show/hide deposit field based on transaction type
if (transactionTypeSelect) {
    transactionTypeSelect.addEventListener('change', (e) => {
        const value = e.target.value || '';
        if (value === '전세') {
            depositField.style.display = 'block';
        } else {
            depositField.style.display = 'none';
        }
    });
}

// Image Upload & Resize
const propertyImagesInput = document.getElementById('propertyImages');
const imagePreviewContainer = document.getElementById('imagePreview');
let uploadedImages = [];

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
                    width = width * ratio;
                    height = height * ratio;
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
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

if (propertyImagesInput) {
    propertyImagesInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);

        if (files.length + uploadedImages.length > 10) {
            alert('최대 10개의 이미지만 업로드할 수 있습니다.');
            return;
        }

        imagePreviewContainer.innerHTML = '<div style="color: var(--admin-muted); padding: 12px;">이미지 처리 중...</div>';

        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                alert(`${file.name}은(는) 5MB를 초과합니다`);
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
    });
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

// Property form submission
if (propertyForm) {
    propertyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(propertyForm);
        formData.delete('images');
        const propertyData = Object.fromEntries(formData.entries());

        try {
            togglePropertyFormDisabled(true);
            const supa = getSupabaseClient();
            if (!supa) {
                alert('Supabase 설정이 없습니다. .env를 확인하세요.');
                togglePropertyFormDisabled(false);
                return;
            }

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
            alert(`매물이 등록되었습니다! (${imageUrls.length}개의 이미지 포함)`);

            uploadedImages = [];
            renderImagePreviews();
            closeModal();
        } catch (err) {
            console.error('매물 등록 실패:', err);
            alert('매물 등록 중 오류가 발생했습니다. 콘솔을 확인하세요.');
        } finally {
            togglePropertyFormDisabled(false);
        }
    });
}

// Initialization hooks
document.addEventListener('DOMContentLoaded', () => {
    updateDashboardStats();
    checkAuth();
    initInquiries();
});

console.log('Admin Dashboard initialized');

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
