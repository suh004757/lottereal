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

  function classifyLink(link) {
    const href = link.getAttribute('href') || '';
    const text = (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
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

  document.addEventListener('click', function (event) {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    const eventInfo = classifyLink(link);
    if (!eventInfo) return;
    sendEvent(eventInfo.name, eventInfo.params);
  }, { capture: true });
})();
