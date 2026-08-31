/**
 * Offers one optional international-guide link on Korean pages.
 * English and Japanese are intentionally single-page guides, not feature mirrors.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'lr_lang_preference';
  const BANNER_ID = 'lr-lang-banner';
  const GUIDES = {
    en: {
      target: 'EN.html',
      message: 'A concise English guide for international clients is available.',
      switchBtn: 'Open English guide',
      stayBtn: 'Stay in Korean'
    },
    ja: {
      target: 'JP.html',
      message: '海外のお客様向けの日本語案内があります。',
      switchBtn: '日本語案内を開く',
      stayBtn: '韓国語サイトを表示'
    }
  };

  function getBrowserLanguage() {
    const language = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (language.startsWith('ko')) return 'ko';
    if (language.startsWith('ja')) return 'ja';
    return 'en';
  }

  function remember(value) {
    try {
      sessionStorage.setItem(STORAGE_KEY, value);
    } catch (_) {
      // The suggestion still works when browser storage is unavailable.
    }
  }

  function remembered() {
    try {
      return Boolean(sessionStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return false;
    }
  }

  function closeBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (!banner) return;
    banner.style.animation = 'slideDown 0.3s ease-out reverse';
    setTimeout(() => banner.remove(), 300);
    remember('stayed');
  }

  function showBanner(config) {
    if (!config || document.getElementById(BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'lr-lang-banner';

    const message = document.createElement('div');
    message.className = 'lr-lang-banner__message';
    message.textContent = config.message;

    const actions = document.createElement('div');
    actions.className = 'lr-lang-banner__actions';

    const switchButton = document.createElement('button');
    switchButton.type = 'button';
    switchButton.className = 'lr-lang-banner__btn lr-lang-banner__btn--primary';
    switchButton.textContent = config.switchBtn;
    switchButton.addEventListener('click', () => {
      remember('switched');
      window.location.href = config.target;
    });

    const stayButton = document.createElement('button');
    stayButton.type = 'button';
    stayButton.className = 'lr-lang-banner__btn lr-lang-banner__btn--secondary';
    stayButton.textContent = config.stayBtn;
    stayButton.addEventListener('click', closeBanner);

    actions.append(switchButton, stayButton);
    banner.append(message, actions);
    document.body.insertBefore(banner, document.body.firstChild);
    setTimeout(() => banner.classList.add('show'), 100);
  }

  function cameFromInternationalGuide() {
    const guidePages = new Set(['EN.html', 'JP.html']);
    if (!document.referrer) return false;
    try {
      const referrer = new URL(document.referrer);
      const filename = referrer.pathname.split('/').pop();
      return referrer.origin === window.location.origin && guidePages.has(filename);
    } catch (_) {
      return false;
    }
  }

  function init() {
    if (cameFromInternationalGuide() || remembered()) return;
    const pageLanguage = (document.documentElement.lang || 'ko').toLowerCase();
    if (!pageLanguage.startsWith('ko')) return;
    const browserLanguage = getBrowserLanguage();
    if (browserLanguage === 'ko') return;
    showBanner(GUIDES[browserLanguage]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
