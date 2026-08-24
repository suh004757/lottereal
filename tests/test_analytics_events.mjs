import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/analyticsEvents.js', import.meta.url), 'utf8');

function loadAnalytics(pathname = '/', href = `https://lottes.co.kr${pathname}`) {
  const events = [];
  const listeners = {};
  const window = {
    location: { origin: 'https://lottes.co.kr', pathname, href, search: new URL(href).search },
    gtag(command, name, params) {
      events.push({ command, name, params });
    }
  };
  const document = {
    documentElement: { lang: 'ko' },
    referrer: '',
    addEventListener(name, handler) { listeners[name] = handler; },
  };
  vm.runInNewContext(source, { window, document, URL, URLSearchParams, console });
  return { events, listeners };
}

function link(href, text = '이동') {
  return {
    getAttribute(name) { return name === 'href' ? href : ''; },
    textContent: text,
  };
}

test('tracks internal navigation with source and destination paths', () => {
  const { events, listeners } = loadAnalytics('/');
  const targetLink = link('listings.html', '매물 보기');
  listeners.click({ target: { closest: () => targetLink } });
  const event = events.find((item) => item.name === 'internal_navigation_click');
  assert.ok(event);
  assert.equal(event.params.from_path, '/');
  assert.equal(event.params.to_path, '/listings.html');
});

test('tracks a listing detail page view with the listing id', () => {
  const { events } = loadAnalytics('/listing-detail.html', 'https://lottes.co.kr/listing-detail.html?id=listing-123');
  const event = events.find((item) => item.name === 'listing_detail_view');
  assert.ok(event);
  assert.equal(event.params.listing_id, 'listing-123');
  assert.equal(event.params.language, 'ko');
});
