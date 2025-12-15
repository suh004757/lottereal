// Admin Dashboard JavaScript
// Handles navigation, session management, and interactive features

// Load analytics data for dashboard stats
function updateDashboardStats() {
    // Get analytics from localStorage (set by analytics.js on public pages)
    const analyticsKey = 'lottereal_analytics';
    const stored = localStorage.getItem(analyticsKey);

    if (stored) {
        const analytics = JSON.parse(stored);
        const now = new Date();

        // Calculate weekly visitors
        const weeklyVisits = analytics.visits ? analytics.visits.filter(visit => {
            const visitDate = new Date(visit.timestamp);
            return (now - visitDate) / (1000 * 60 * 60 * 24) < 7;
        }).length : 0;

        // Calculate growth
        const lastWeekVisits = analytics.visits ? analytics.visits.filter(visit => {
            const visitDate = new Date(visit.timestamp);
            const daysAgo = (now - visitDate) / (1000 * 60 * 60 * 24);
            return daysAgo >= 7 && daysAgo < 14;
        }).length : 0;

        const growth = lastWeekVisits > 0
            ? Math.round(((weeklyVisits - lastWeekVisits) / lastWeekVisits) * 1000) / 10
            : 0;

        // Update UI
        const visitorValueEl = document.querySelector('.admin-stat-card:nth-child(3) .admin-stat-value');
        const visitorChangeEl = document.querySelector('.admin-stat-card:nth-child(3) .admin-stat-change');

        if (visitorValueEl) {
            visitorValueEl.textContent = weeklyVisits.toLocaleString();
        }

        if (visitorChangeEl) {
            const sign = growth >= 0 ? '+' : '';
            visitorChangeEl.textContent = `${sign}${growth}%`;
            visitorChangeEl.className = 'admin-stat-change' + (growth >= 0 ? ' positive' : '');
        }
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
    updateDashboardStats();
});

// Session Management
let sessionTimeout = 30 * 60; // 30 minutes in seconds
let sessionTimer;

function updateSessionTimer() {
    const minutes = Math.floor(sessionTimeout / 60);
    const seconds = sessionTimeout % 60;
    const timerElement = document.getElementById('sessionTimer');

    if (timerElement) {
        timerElement.textContent = `세션: ${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Warning when less than 5 minutes
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

// Start session timer
sessionTimer = setInterval(updateSessionTimer, 1000);

// Reset timer on user activity
document.addEventListener('mousemove', resetSessionTimer);
document.addEventListener('keypress', resetSessionTimer);
document.addEventListener('click', resetSessionTimer);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Update dashboard stats
    updateDashboardStats();

    checkAuth();

    // Set user name if available
    const userName = sessionStorage.getItem('adminUserName');
    if (userName) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = userName;
        }
    }

    // Navigation - moved here to ensure DOM is loaded
    const navItems = document.querySelectorAll('.admin-nav__item');
    const sections = document.querySelectorAll('.admin-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));

            // Add active class to clicked item
            item.classList.add('active');

            // Hide all sections
            sections.forEach(section => section.classList.remove('active'));

            // Show corresponding section
            const sectionId = item.getAttribute('data-section') + '-section';
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
});

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

// Close modal function
function closeModal() {
    propertyModal.classList.remove('active');
    document.body.style.overflow = '';
    propertyForm.reset();
}

// Close modal events
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
}

if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', closeModal);
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
}

// ESC key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && propertyModal.classList.contains('active')) {
        closeModal();
    }
});

// Show/hide deposit field based on transaction type
if (transactionTypeSelect) {
    transactionTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === '월세') {
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

// Resize image to max dimensions while maintaining aspect ratio
async function resizeImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions
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
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Handle image selection
if (propertyImagesInput) {
    propertyImagesInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);

        if (files.length + uploadedImages.length > 10) {
            alert('최대 10개의 이미지만 업로드할 수 있습니다.');
            return;
        }

        imagePreviewContainer.innerHTML = '<div style="color: var(--admin-muted); padding: 12px;">이미지 처리 중...</div>';

        for (const file of files) {
            // Check file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                alert(`${file.name}은(는) 5MB를 초과합니다.`);
                continue;
            }

            // Resize image
            const resizedFile = await resizeImage(file);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImages.push({
                    file: resizedFile,
                    preview: e.target.result,
                    originalSize: file.size,
                    resizedSize: resizedFile.size
                });
                renderImagePreviews();
            };
            reader.readAsDataURL(resizedFile);
        }
    });
}

// Render image previews
function renderImagePreviews() {
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

        // Remove the file input from formData (we'll handle images separately)
        formData.delete('images');

        const propertyData = Object.fromEntries(formData.entries());

        console.log('Property data:', propertyData);
        console.log('Images to upload:', uploadedImages.length);

        // TODO: Upload images to Supabase Storage
        // const imageUrls = await uploadImagesToSupabase(uploadedImages);
        // propertyData.images = imageUrls;

        // TODO: Send property data to Supabase
        alert(`매물이 등록되었습니다! (${uploadedImages.length}개 이미지 포함)`);

        // Reset
        uploadedImages = [];
        closeModal();
    });
}

console.log('Admin Dashboard initialized');
