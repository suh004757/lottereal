(function () {
  'use strict';

  const GA_ID = 'G-VPG00DG5V1';
  const NAVER_WA = '1a98a7eafcb1eb0';
  const CHOICE_KEY = 'lr_analytics_choice';
  const ANALYTICS_ALLOWED = 'allowed';
  const ANALYTICS_REQUIRED_ONLY = 'required-only';
  const PRIVACY_PAGES = new Set(['/privacy.html', '/privacy_EN.html']);
  const PRIVACY_SECTION_PAGES = new Set(['/EN.html']);

  function isPrivacyPage() {
    const path = window.location.pathname || '/';
    const page = `/${path.split('/').pop()}`;
    return PRIVACY_PAGES.has(path) || PRIVACY_PAGES.has(page) ||
      (PRIVACY_SECTION_PAGES.has(page) && window.location.hash === '#privacy');
  }

  function analyticsChoice() {
    try {
      return window.localStorage.getItem(CHOICE_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function doNotTrack() {
    return navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function deleteAnalyticsCookies() {
    const prefixes = ['_ga', '_gid', '_gat', 'wcs_bt', '_fwb', 'NA_'];
    document.cookie.split(';').forEach((part) => {
      const name = part.split('=')[0].trim();
      if (!prefixes.some((prefix) => name.startsWith(prefix))) return;
      const expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      document.cookie = `${name}=; ${expiry}`;
      document.cookie = `${name}=; ${expiry}; domain=.${window.location.hostname}`;
    });
  }

  function analyticsPreferenceEnabled() {
    return !doNotTrack() && analyticsChoice() === ANALYTICS_ALLOWED;
  }

  function analyticsEnabled() {
    return !isPrivacyPage() && analyticsPreferenceEnabled();
  }

  function sanitizedReferrer() {
    if (!document.referrer) return '';
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin + referrer.pathname;
    } catch (_) {
      return '';
    }
  }

  function setAnalyticsEnabled(enabled) {
    let saved = false;
    try {
      window.localStorage.setItem(
        CHOICE_KEY,
        enabled ? ANALYTICS_ALLOWED : ANALYTICS_REQUIRED_ONLY
      );
      saved = true;
    } catch (_) {
      // If storage is unavailable, analytics remains off by default.
    }
    if (!enabled) {
      window[`ga-disable-${GA_ID}`] = true;
      deleteAnalyticsCookies();
    } else if (saved) {
      window[`ga-disable-${GA_ID}`] = false;
      initializeAnalytics();
    }
    if (saved) {
      document.querySelector('[data-analytics-notice]')?.remove();
      updateControls();
    }
  }

  window.LotteRealPrivacy = Object.freeze({
    analyticsChoice,
    analyticsEnabled,
    setAnalyticsEnabled,
    doNotTrack
  });

  function updateControls() {
    const status = document.querySelector('[data-analytics-status]');
    const enabled = analyticsPreferenceEnabled();
    const choice = analyticsChoice();
    const language = document.documentElement.lang?.toLowerCase() || 'ko';
    const isEnglish = language.startsWith('en');
    const isJapanese = language.startsWith('ja');
    if (status) {
      const messages = doNotTrack()
        ? {
            ko: '브라우저의 추적 거부 설정을 존중해 분석을 사용하지 않습니다.',
            en: 'Analytics is disabled because your browser sends Do Not Track.',
            ja: 'ブラウザの追跡拒否設定に従い、アクセス解析を使用していません。'
          }
        : enabled
          ? {
              ko: '개인정보를 최소화한 방문 분석을 사용하고 있습니다.',
              en: 'Privacy-minimized visit analytics is enabled.',
              ja: '個人情報を最小限にしたアクセス解析を使用しています。'
            }
          : choice === ANALYTICS_REQUIRED_ONLY
            ? {
                ko: '필수 사이트 기능만 사용하고 있습니다.',
                en: 'Only required site functions are enabled.',
                ja: '必須のサイト機能のみを使用しています。'
              }
            : {
                ko: '방문 분석을 허용하지 않은 상태입니다.',
                en: 'Visit analytics has not been allowed.',
                ja: 'アクセス解析は許可されていません。'
              };
      status.textContent = isJapanese ? messages.ja : isEnglish ? messages.en : messages.ko;
    }
    document.querySelectorAll('[data-analytics-disable]').forEach((button) => {
      button.disabled = choice === ANALYTICS_REQUIRED_ONLY || doNotTrack();
      button.onclick = () => setAnalyticsEnabled(false);
    });
    document.querySelectorAll('[data-analytics-enable]').forEach((button) => {
      button.disabled = enabled || doNotTrack();
      button.onclick = () => setAnalyticsEnabled(true);
    });
  }

  function showAnalyticsNotice() {
    if (isPrivacyPage() || doNotTrack() || analyticsChoice() || document.querySelector('[data-analytics-notice]')) return;
    const language = document.documentElement.lang?.toLowerCase() || 'ko';
    const isEnglish = language.startsWith('en');
    const isJapanese = language.startsWith('ja');
    const notice = document.createElement('aside');
    notice.className = 'lr-analytics-notice';
    notice.setAttribute('data-analytics-notice', '');
    notice.setAttribute('role', 'region');
    notice.setAttribute('aria-label', isJapanese ? 'アクセス解析の選択' : isEnglish ? 'Visit analytics choice' : '방문 분석 선택');
    notice.innerHTML = isJapanese
      ? '<p><strong>アクセス解析を許可しますか？</strong> 検索文・電話番号・問い合わせ本文は送信しません。<a href="/JP.html#privacy">アクセス解析の詳細</a></p><div><button type="button" data-notice-required>必須機能のみ</button><button type="button" data-notice-allow>アクセス解析を許可</button></div>'
      : isEnglish
        ? '<p><strong>Allow privacy-minimized analytics?</strong> Search text, phone numbers and inquiry messages are never sent. <a href="/EN.html#privacy">Analytics details</a></p><div><button type="button" data-notice-required>Required only</button><button type="button" data-notice-allow>Allow analytics</button></div>'
        : '<p><strong>사이트 개선용 방문 분석을 허용할까요?</strong> 검색 문장·전화번호·문의 내용은 보내지 않습니다. <a href="/privacy.html#analytics-control">방문 분석 자세히 보기</a></p><div><button type="button" data-notice-required>필수 기능만</button><button type="button" data-notice-allow>방문 분석 허용</button></div>';
    const style = document.createElement('style');
    style.id = 'lr-analytics-notice-style';
    style.textContent = '.lr-analytics-notice{position:fixed;z-index:10000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));max-width:720px;margin:auto;padding:12px 14px;background:#fff;color:#1f2937;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,.16);font:14px/1.5 system-ui,sans-serif}.lr-analytics-notice p{margin:0 0 8px}.lr-analytics-notice p a{color:#334155;text-underline-offset:3px;white-space:nowrap}.lr-analytics-notice div{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.lr-analytics-notice button{min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:8px;font:inherit}.lr-analytics-notice button{border:1px solid #475569;background:#fff;color:#1f2937;cursor:pointer}.lr-analytics-notice [data-notice-allow]{background:#1f2937;color:#fff}.lr-analytics-notice button:focus-visible,.lr-analytics-notice p a:focus-visible{outline:3px solid #8a5b28;outline-offset:2px}body.knowledge-widget-open .lr-analytics-notice{display:none}@media(max-width:768px){body:has(.lr-mobile-actionbar) .lr-analytics-notice{bottom:calc(96px + env(safe-area-inset-bottom))}body.intl-page:not(:has(.intl-mobile-actionbar.is-visible)) .lr-analytics-notice{bottom:max(12px,env(safe-area-inset-bottom))}}@media(max-width:480px){.lr-analytics-notice div{display:grid;grid-template-columns:1fr 1fr}}';
    if (!document.getElementById(style.id)) document.head.appendChild(style);
    document.body.appendChild(notice);
    notice.querySelector('[data-notice-required]').addEventListener('click', () => setAnalyticsEnabled(false));
    notice.querySelector('[data-notice-allow]').addEventListener('click', () => setAnalyticsEnabled(true));
  }

  function onReady() {
    updateControls();
    showAnalyticsNotice();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else onReady();

  let analyticsStarted = false;

  function initializeAnalytics() {
    if (analyticsStarted || !analyticsEnabled()) return;
    analyticsStarted = true;
    window[`ga-disable-${GA_ID}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      page_path: window.location.pathname,
      page_location: window.location.origin + window.location.pathname,
      page_referrer: sanitizedReferrer(),
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 7776000,
      cookie_update: false
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);

    window.wcs_add = window.wcs_add || {};
    window.wcs_add.wa = NAVER_WA;
    const naverScript = document.createElement('script');
    naverScript.async = true;
    naverScript.src = 'https://wcs.pstatic.net/wcslog.js';
    naverScript.addEventListener('load', sendNaverPageview, { once: true });
    document.head.appendChild(naverScript);
  }

  // Naver Analytics shows Naver search inflow, which GA4 does not. Same consent gate.
  // wcslog.js reads location.href and document.referrer itself and has no override, so
  // the query and fragment are hidden while wcs_do() builds and sends its beacon
  // (synchronously), matching what GA4 receives.
  function sendNaverPageview() {
    if (!analyticsEnabled() || !window.wcs) return;
    const fullUrl = window.location.href;
    const cleanUrl = window.location.pathname;
    if (window.location.search || window.location.hash) window.history.replaceState(window.history.state, '', cleanUrl);
    const cleanReferrer = sanitizedReferrer();
    const referrerDescriptor = Object.getOwnPropertyDescriptor(document, 'referrer');
    const hideReferrerDetails = Boolean(document.referrer);
    if (hideReferrerDetails) Object.defineProperty(document, 'referrer', { configurable: true, get: () => cleanReferrer });
    try {
      window.wcs_do();
    } finally {
      if (hideReferrerDetails) {
        if (referrerDescriptor) Object.defineProperty(document, 'referrer', referrerDescriptor);
        else delete document.referrer;
      }
      if (window.location.href !== fullUrl) window.history.replaceState(window.history.state, '', fullUrl);
    }
  }

  if (analyticsEnabled()) initializeAnalytics();
  else {
    window[`ga-disable-${GA_ID}`] = true;
    deleteAnalyticsCookies();
  }
})();
