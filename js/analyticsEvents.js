(function () {
  'use strict';

  function sendEvent(name, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, {
      page_path: window.location.pathname,
      page_location: window.location.href,
      ...params
    });
  }

  function linkText(link) {
    return (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function classifyLink(link) {
    const href = link.getAttribute('href') || '';
    const text = linkText(link);
    const lowerHref = href.toLowerCase();

    if (lowerHref.startsWith('tel:')) {
      return { name: 'phone_click', params: { link_text: text, link_url: href } };
    }

    if (lowerHref.includes('kakao')) {
      return { name: 'kakao_click', params: { link_text: text, link_url: href } };
    }

    if (lowerHref.includes('contact')) {
      const isEnglish = document.documentElement.lang?.toLowerCase().startsWith('en');
      return { name: isEnglish ? 'english_contact_click' : 'report_to_contact_click', params: { link_text: text, link_url: href } };
    }

    if (lowerHref.includes('listings')) {
      return { name: window.location.pathname.includes('report') ? 'report_to_listing_click' : 'listing_view', params: { link_text: text, link_url: href } };
    }

    if (lowerHref.includes('naver.me') || lowerHref.includes('map.naver') || lowerHref.includes('goo.gl/maps')) {
      return { name: 'directions_click', params: { link_text: text, link_url: href } };
    }

    return null;
  }

  function classifyInternalNavigation(link) {
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) return null;
    try {
      const target = new URL(href, window.location.href);
      if (target.origin !== window.location.origin) return null;
      return {
        name: 'internal_navigation_click',
        params: {
          link_text: linkText(link),
          link_url: target.href,
          from_path: window.location.pathname,
          to_path: `${target.pathname}${target.search}`
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
      listing_id: params.get('id') || '',
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
