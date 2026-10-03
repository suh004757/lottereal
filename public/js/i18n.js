/**
 * Translation Module
 * Provides translations for dynamic content based on page language
 */

(function () {
    'use strict';

    // Translation dictionary
    const translations = {
        ko: {
            // Feed widget translations
            feedsUpdated: '업데이트됨',
            feedsError: '뉴스를 불러올 수 없습니다',
            feedsLoading: '뉴스 불러오는 중...',

            // Report preview translations
            reportLoading: '로딩 중',
            reportLoadingTitle: '최신 리포트를 불러오는 중입니다.',
            reportLoadingSummary: '잠시만 기다려 주세요.',
            reportError: '오류',
            reportErrorTitle: '리포트를 불러오지 못했습니다',
            reportErrorSummary: '잠시 후 다시 시도해주세요.',
            reportViewDetails: '자세히 보기',
            reportReload: '다시 불러오기',

            // Time ago translations
            timeJustNow: '방금 전',
            timeMinutesAgo: '분 전',
            timeHoursAgo: '시간 전',
            timeDaysAgo: '일 전',
            timeWeeksAgo: '주 전',
            timeMonthsAgo: '개월 전',
            timeYearsAgo: '년 전'
        },
        en: {
            // Feed widget translations
            feedsUpdated: 'Updated',
            feedsError: 'Failed to load news',
            feedsLoading: 'Loading news...',

            // Report preview translations
            reportLoading: 'Loading',
            reportLoadingTitle: 'Loading latest report...',
            reportLoadingSummary: 'Please wait a moment.',
            reportError: 'Error',
            reportErrorTitle: 'Failed to load report',
            reportErrorSummary: 'Please try again later.',
            reportViewDetails: 'View Details',
            reportReload: 'Reload',

            // Time ago translations
            timeJustNow: 'just now',
            timeMinutesAgo: 'min ago',
            timeHoursAgo: 'hr ago',
            timeDaysAgo: 'd ago',
            timeWeeksAgo: 'w ago',
            timeMonthsAgo: 'mo ago',
            timeYearsAgo: 'yr ago'
        }
    };

    /**
     * Detect page language based on URL
     * @returns {string} 'ko' or 'en'
     */
    function getPageLanguage() {
        const pathname = window.location.pathname.toLowerCase();
        const filename = pathname.split('/').pop();

        // English pages
        if (filename.includes('_en.html') || filename.includes('-en.html') || filename === 'en.html') {
            return 'en';
        }

        // Default to Korean
        return 'ko';
    }

    /**
     * Get translated text
     * @param {string} key - Translation key
     * @returns {string} Translated text
     */
    function t(key) {
        const lang = getPageLanguage();
        return translations[lang][key] || translations['ko'][key] || key;
    }

    /**
     * Format relative time
     * @param {Date} date - Date to format
     * @returns {string} Formatted relative time
     */
    function timeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (seconds < 60) return t('timeJustNow');
        if (minutes < 60) return `${minutes}${t('timeMinutesAgo')}`;
        if (hours < 24) return `${hours}${t('timeHoursAgo')}`;
        if (days < 7) return `${days}${t('timeDaysAgo')}`;
        if (weeks < 4) return `${weeks}${t('timeWeeksAgo')}`;
        if (months < 12) return `${months}${t('timeMonthsAgo')}`;
        return `${years}${t('timeYearsAgo')}`;
    }

    // Export to global scope
    window.LR_i18n = {
        t: t,
        timeAgo: timeAgo,
        getPageLanguage: getPageLanguage
    };

})();
