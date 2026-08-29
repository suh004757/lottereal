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
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const { events } = loadAnalytics('/listing-detail.html', `https://lottes.co.kr/listing-detail.html?id=${id}`);
  const event = events.find((item) => item.name === 'listing_detail_view');
  assert.ok(event);
  assert.equal(event.params.listing_id, id);
  assert.equal(event.params.language, 'ko');
});

test('does not send phone numbers displayed inside telephone links', () => {
  const { events, listeners } = loadAnalytics('/contact_EN.html');
  const targetLink = link('tel:050714025055', '0507-1402-5055');
  listeners.click({ target: { closest: () => targetLink } });
  const event = events.find((item) => item.name === 'phone_click');
  assert.ok(event);
  assert.equal(event.params.link_type, 'phone_link');
  assert.ok(!JSON.stringify(event.params).includes('0507'));
});

test('does not send user-controlled non-UUID listing query values', () => {
  const href = 'https://lottes.co.kr/listing-detail.html?id=01012345678%40example.com';
  const { events } = loadAnalytics('/listing-detail.html', href);
  const event = events.find((item) => item.name === 'listing_detail_view');
  assert.ok(event);
  assert.equal(event.params.listing_id, 'invalid');
  assert.ok(!JSON.stringify(event.params).includes('01012345678'));
});

test('does not send visible text from internal or classified links', () => {
  const { events, listeners } = loadAnalytics('/');
  const targetLink = link('listings.html', '010-1234-5678 customer text');
  listeners.click({ target: { closest: () => targetLink } });
  assert.ok(events.some((item) => item.name === 'listing_view'));
  assert.ok(events.some((item) => item.name === 'internal_navigation_click'));
  assert.ok(!JSON.stringify(events).includes('010-1234-5678'));
});

test('keeps generic contact clicks separate from report-to-contact conversions', () => {
  const home = loadAnalytics('/index.html');
  const contactLink = link('contact.html#inquiry-options', '문의 남기기');
  home.listeners.click({ target: { closest: () => contactLink } });
  assert.ok(home.events.some((item) => item.name === 'contact_click'));
  assert.ok(!home.events.some((item) => item.name === 'report_to_contact_click'));

  const report = loadAnalytics('/report.html');
  report.listeners.click({ target: { closest: () => contactLink } });
  assert.ok(report.events.some((item) => item.name === 'report_to_contact_click'));
  assert.ok(!report.events.some((item) => item.name === 'contact_click'));
});
