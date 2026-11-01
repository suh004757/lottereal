// Public short-term listing pages: replace the static move-in text with the date
// computed from listing_unavailable_periods and draw the availability calendar.
// If the request fails the static text stays and the calendar stays hidden.
import { APP_CONFIG } from './config/appConfig.js';
import { formatAvailability, nextAvailableDate, seoulToday } from './utils/shortStayAvailability.mjs';
import { renderCalendarMonths } from './shortStayCalendarView.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function fetchPeriods(listingIds, today) {
  const url = new URL('/rest/v1/listing_unavailable_periods', APP_CONFIG.SUPABASE_URL);
  url.searchParams.set('select', 'listing_id,starts_on,ends_on');
  url.searchParams.set('listing_id', `in.(${listingIds.join(',')})`);
  url.searchParams.set('ends_on', `gte.${today}`);
  url.searchParams.set('order', 'starts_on.asc');
  const response = await fetch(url, { headers: { apikey: APP_CONFIG.SUPABASE_KEY, Authorization: `Bearer ${APP_CONFIG.SUPABASE_KEY}` } });
  if (!response.ok) throw new Error(`availability request failed: ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function initShortStayAvailability() {
  const labels = [...document.querySelectorAll('[data-shortstay-availability]')];
  const calendars = [...document.querySelectorAll('[data-shortstay-calendar]')];
  const ids = [...new Set([...labels, ...calendars]
    .map((el) => el.dataset.shortstayAvailability || el.dataset.shortstayCalendar)
    .filter((id) => UUID.test(id || '')))];
  if (!ids.length) return;

  const locale = (document.documentElement.lang || 'ko').slice(0, 2);
  const today = seoulToday();
  let rows;
  try {
    rows = await fetchPeriods(ids, today);
  } catch (err) {
    console.warn('[shortstay] availability unavailable', err);
    return;
  }

  const periodsFor = (id) => rows.filter((row) => row.listing_id === id);
  labels.forEach((el) => {
    const id = el.dataset.shortstayAvailability;
    if (!UUID.test(id || '')) return;
    el.textContent = formatAvailability(nextAvailableDate(periodsFor(id), today), today, locale, el.dataset.variant || 'long');
  });
  calendars.forEach((el) => {
    const id = el.dataset.shortstayCalendar;
    const grid = el.querySelector('[data-calendar-grid]');
    if (!UUID.test(id || '') || !grid) return;
    renderCalendarMonths(grid, { periods: periodsFor(id), today, locale, months: 2 });
    el.hidden = false;
  });
}

initShortStayAvailability();
