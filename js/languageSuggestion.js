/**
 * Language Suggestion Module
 * Shows a non-intrusive banner suggesting language switch based on browser locale
 * Stores user preference in sessionStorage to avoid repeated prompts
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'lr_lang_preference';
    const BANNER_ID = 'lr-lang-banner';

    // Language mappings
    const LANG_MAP = {
        ko: {
            target: 'en',
            message: 'English version is available.',
            switchBtn: 'Switch to English',
            stayBtn: 'Stay in Korean'
        },
        en: {
            target: 'ko',
            message: '한국어 버전을 사용하실 수 있습니다.',
            switchBtn: '한국어로 전환',
            stayBtn: 'Stay in English'
        }
    };

    // Page mappings (Korean <-> English)
    const PAGE_MAP = {
        'index.html': 'EN.html',
        'EN.html': 'index.html',
        'contact.html': 'contact_EN.html',
        'contact_EN.html': 'contact.html',
        'listings.html': 'listings-en.html',
        'listings-en.html': 'listings.html',
        'listing-detail.html': 'listing-detail-en.html',
        'listing-detail-en.html': 'listing-detail.html',
        'privacy.html': 'privacy_EN.html',
        'privacy_EN.html': 'privacy.html'
    };

    /**
     * Get browser language (simplified to 'ko' or 'en')
     */
    function getBrowserLang() {
        const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        return lang.startsWith('ko') ? 'ko' : 'en';
    }

    /**
     * Get current page language based on filename
     */
    function getCurrentPageLang() {
        const page = window.location.pathname.split('/').pop().toLowerCase();

        // English pages
        if (page.includes('_en.html') || page.includes('-en.html') || page === 'en.html') {
            return 'en';
        }

        // Default to Korean
        return 'ko';
    }

    /**
     * Get the equivalent page in the target language
     */
    function getTargetPage() {
        const currentPage = window.location.pathname.split('/').pop();
        return PAGE_MAP[currentPage] || null;
    }

    /**
     * Create and show the language suggestion banner
     */
    function showBanner(browserLang, pageLang) {
        const config = LANG_MAP[browserLang];
        if (!config) return;

        // Create banner HTML
        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.className = 'lr-lang-banner';
        banner.innerHTML = `
      <div class="lr-lang-banner__message">${config.message}</div>
      <div class="lr-lang-banner__actions">
        <button class="lr-lang-banner__btn lr-lang-banner__btn--primary" data-action="switch">
          ${config.switchBtn}
        </button>
        <button class="lr-lang-banner__btn lr-lang-banner__btn--secondary" data-action="stay">
          ${config.stayBtn}
        </button>
      </div>
    `;

        // Add to page
        document.body.insertBefore(banner, document.body.firstChild);

        // Show with animation
        setTimeout(() => banner.classList.add('show'), 100);

        // Attach event listeners
        banner.querySelector('[data-action="switch"]').addEventListener('click', handleSwitch);
        banner.querySelector('[data-action="stay"]').addEventListener('click', handleStay);
    }

    /**
     * Handle switch language action
     */
    function handleSwitch() {
        const targetPage = getTargetPage();

        if (targetPage) {
            // Store preference
            sessionStorage.setItem(STORAGE_KEY, 'switched');

            // Navigate to target page
            window.location.href = targetPage;
        } else {
            // No mapping found, just close banner
            handleStay();
        }
    }

    /**
     * Handle stay in current language action
     */
    function handleStay() {
        const banner = document.getElementById(BANNER_ID);

        if (banner) {
            banner.style.animation = 'slideDown 0.3s ease-out reverse';
            setTimeout(() => banner.remove(), 300);
        }

        // Store preference
        sessionStorage.setItem(STORAGE_KEY, 'stayed');
    }

    /**
     * Initialize language suggestion
     */
    function init() {
        // Check if user already made a choice this session
        const preference = sessionStorage.getItem(STORAGE_KEY);
        if (preference) return;

        // Get languages
        const browserLang = getBrowserLang();
        const pageLang = getCurrentPageLang();

        // Only show banner if there's a mismatch
        if (browserLang !== pageLang) {
            // Check if there's a target page available
            const targetPage = getTargetPage();
            if (targetPage) {
                showBanner(browserLang, pageLang);
            }
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
