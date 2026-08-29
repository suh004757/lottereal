(function () {
  'use strict';

  function sendEvent(name, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, {
      page_path: window.location.pathname,
      ...params
    });
  }

  function safeListingId(value) {
    const candidate = String(value || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate
      : 'invalid';
  }

  function classifyLink(link) {
    const href = link.getAttribute('href') || '';
    const lowerHref = href.toLowerCase();

    if (lowerHref.startsWith('tel:')) {
      return { name: 'phone_click', params: { link_type: 'phone_link' } };
    }

    if (lowerHref.includes('kakao')) {
      return { name: 'kakao_click', params: { link_type: 'kakao_link' } };
    }

    if (lowerHref.includes('contact')) {
      const isEnglish = document.documentElement.lang?.toLowerCase().startsWith('en');
      const isReportPage = window.location.pathname.includes('report');
      const eventName = isEnglish
        ? 'english_contact_click'
        : (isReportPage ? 'report_to_contact_click' : 'contact_click');
      return { name: eventName, params: { link_type: 'contact_link' } };
    }

    if (lowerHref.includes('listings')) {
      return { name: window.location.pathname.includes('report') ? 'report_to_listing_click' : 'listing_view', params: { link_type: 'listing_link' } };
    }

    if (lowerHref.includes('naver.me') || lowerHref.includes('map.naver') || lowerHref.includes('goo.gl/maps')) {
      return { name: 'directions_click', params: { link_type: 'directions_link' } };
    }

    return null;
  }

  function classifyInternalNavigation(link) {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) return null;
    try {
      const target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) return null;
      return {
        name: 'internal_navigation_click',
        params: {
          from_path: window.location.pathname,
          to_path: target.pathname
        }
      };
    } catch (_) {
      return null;
    }
  }

  function trackDetailView() {
    if (!window.location.pathname.includes('listing-detail')) return;
    const params = new URLSearchParams(window.location.search || '');
    const isEnglish = document.documentElement.lang?.toLowerCase().startsWith('en');
    sendEvent('listing_detail_view', {
      listing_id: safeListingId(params.get('id')),
      language: isEnglish ? 'en' : 'ko'
    });
  }

  trackDetailView();

  document.addEventListener('click', function (event) {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    const eventInfo = classifyLink(link);
    if (eventInfo) sendEvent(eventInfo.name, eventInfo.params);
    const navigationInfo = classifyInternalNavigation(link);
    if (navigationInfo) sendEvent(navigationInfo.name, navigationInfo.params);
  }, { capture: true });
})();
