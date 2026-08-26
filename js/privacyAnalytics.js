(function () {
  'use strict';

  const GA_ID = 'G-VPG00DG5V1';
  const CHOICE_KEY = 'lr_analytics_choice';
  const ANALYTICS_ALLOWED = 'allowed';
  const ANALYTICS_REQUIRED_ONLY = 'required-only';
  const PRIVACY_PAGES = new Set(['/privacy.html', '/privacy_EN.html']);
  const path = window.location.pathname || '/';
  const privacyPage = PRIVACY_PAGES.has(path) || PRIVACY_PAGES.has(`/${path.split('/').pop()}`);

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
    const prefixes = ['_ga', '_gid', '_gat'];
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
    return !privacyPage && analyticsPreferenceEnabled();
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
    }
    if (saved) window.location.reload();
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
    const isEnglish = document.documentElement.lang?.toLowerCase().startsWith('en');
    if (status) {
      status.textContent = isEnglish
        ? doNotTrack()
          ? 'Analytics is disabled because your browser sends Do Not Track.'
          : enabled
            ? 'Privacy-minimized visit analytics is enabled.'
            : choice === ANALYTICS_REQUIRED_ONLY
              ? 'Only required site functions are enabled.'
              : 'Visit analytics has not been allowed.'
        : doNotTrack()
          ? '브라우저의 추적 거부 설정을 존중해 분석을 사용하지 않습니다.'
          : enabled
            ? '개인정보를 최소화한 방문 분석을 사용하고 있습니다.'
            : choice === ANALYTICS_REQUIRED_ONLY
              ? '필수 사이트 기능만 사용하고 있습니다.'
              : '방문 분석을 허용하지 않은 상태입니다.';
    }
    document.querySelectorAll('[data-analytics-disable]').forEach((button) => {
      button.disabled = choice === ANALYTICS_REQUIRED_ONLY || doNotTrack();
      button.addEventListener('click', () => setAnalyticsEnabled(false));
    });
    document.querySelectorAll('[data-analytics-enable]').forEach((button) => {
      button.disabled = enabled || doNotTrack();
      button.addEventListener('click', () => setAnalyticsEnabled(true));
    });
  }

  function showAnalyticsNotice() {
    if (privacyPage || doNotTrack() || analyticsChoice() || document.querySelector('[data-analytics-notice]')) return;
    const isEnglish = document.documentElement.lang?.toLowerCase().startsWith('en');
    const notice = document.createElement('aside');
    notice.className = 'lr-analytics-notice';
    notice.setAttribute('data-analytics-notice', '');
    notice.setAttribute('role', 'region');
    notice.setAttribute('aria-label', isEnglish ? 'Visit analytics choice' : '방문 분석 선택');
    notice.innerHTML = isEnglish
      ? '<p><strong>Visit analytics</strong><br>We can use privacy-minimized analytics to improve this site. Search text, phone numbers, and inquiry messages are never sent.</p><div><button type="button" data-notice-required>Required only</button><button type="button" data-notice-allow>Allow analytics</button><a href="privacy_EN.html#analytics-control">Details</a></div>'
      : '<p><strong>방문 분석 선택</strong><br>사이트 개선을 위해 개인정보를 최소화한 분석을 사용할 수 있습니다. 검색 문장·전화번호·문의 내용은 보내지 않습니다.</p><div><button type="button" data-notice-required>필수 기능만</button><button type="button" data-notice-allow>방문 분석 허용</button><a href="privacy.html#analytics-control">자세히</a></div>';
    const style = document.createElement('style');
    style.id = 'lr-analytics-notice-style';
    style.textContent = '.lr-analytics-notice{position:fixed;z-index:10000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));max-width:720px;margin:auto;padding:14px 16px;background:#fff;color:#1f2937;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,.16);font:14px/1.5 system-ui,sans-serif}.lr-analytics-notice p{margin:0 0 10px}.lr-analytics-notice div{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.lr-analytics-notice button,.lr-analytics-notice a{min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:8px;font:inherit}.lr-analytics-notice button{border:1px solid #475569;background:#fff;color:#1f2937;cursor:pointer}.lr-analytics-notice [data-notice-allow]{background:#1f2937;color:#fff}.lr-analytics-notice a{color:#334155;text-underline-offset:3px}.lr-analytics-notice button:focus-visible,.lr-analytics-notice a:focus-visible{outline:3px solid #8a5b28;outline-offset:2px}@media(max-width:768px){body:has(.lr-mobile-actionbar) .lr-analytics-notice{bottom:calc(96px + env(safe-area-inset-bottom))}}@media(max-width:480px){.lr-analytics-notice div{display:grid;grid-template-columns:1fr 1fr}.lr-analytics-notice a{grid-column:1/-1;min-height:36px}}';
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

  if (!analyticsEnabled()) {
    window[`ga-disable-${GA_ID}`] = true;
    deleteAnalyticsCookies();
    return;
  }

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
})();
