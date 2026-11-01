// Public short-term listing pages: replace the static move-in text with the date
// computed from listing_unavailable_periods and draw the availability calendar.
// If the request fails the static text stays and the calendar stays hidden.
import { formatAvailability, nextAvailableDate, seoulToday } from './utils/shortStayAvailability.mjs';
import { renderCalendarMonths } from './shortStayCalendarView.mjs';
import { LISTING_UUID as UUID, fetchPeriods } from './shortStayPeriods.js';

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
    // A calendar inside a lease request form is drawn by leaseRequest.js, which
    // makes the days selectable.
    if (el.closest('[data-lease-request]')) return;
    const id = el.dataset.shortstayCalendar;
    const grid = el.querySelector('[data-calendar-grid]');
    if (!UUID.test(id || '') || !grid) return;
    renderCalendarMonths(grid, { periods: periodsFor(id), today, locale, months: 2 });
    el.hidden = false;
  });
}

initShortStayAvailability();
