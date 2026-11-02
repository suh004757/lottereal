// Short-term lease request on the Korean listing page: pick 입주일/퇴거일 on the
// availability calendar, see the quote, and send it as an inquiry. Nothing is
// charged here; the office confirms dates, sends the contract and bank details.
// If availability cannot be loaded the section stays hidden and the phone and
// inquiry links remain the way in.
import { createInquiry } from './services/backendAdapter.js';
import { fromDayNumber, seoulToday, toDayNumber } from './utils/shortStayAvailability.mjs';
import {
  EXTENSION_MAX_DAYS,
  buildLeaseRequestPayload,
  describeQuote,
  formatWon,
  isExtensionStart,
  quoteExtension,
  quoteLease,
  rangeIsOpen
} from './utils/leaseQuote.mjs';
import { renderCalendarMonths } from './shortStayCalendarView.mjs';
import { LISTING_UUID, fetchPeriods } from './shortStayPeriods.js';

const section = document.querySelector('[data-lease-request]');
const calendar = section?.querySelector('[data-shortstay-calendar]');
const grid = calendar?.querySelector('[data-calendar-grid]');
const form = section?.querySelector('[data-lease-request-form]');
const quoteEl = section?.querySelector('[data-lease-quote]');
const statusEl = section?.querySelector('[data-lease-status]');

const extensionHint = section?.querySelector('[data-lease-extension-hint]');
const startLabel = section?.querySelector('[data-lease-start-label]');
const endLabel = section?.querySelector('[data-lease-end-label]');

let periods = [];
let today = '';

function showStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
  statusEl.setAttribute('role', state === 'error' ? 'alert' : 'status');
  statusEl.hidden = !text;
}

function isExtension() {
  return form.elements.kind.value === 'extension';
}

function updateQuote() {
  const { startsOn, endsOn } = form.elements;
  if (isExtension()) {
    updateExtensionQuote(startsOn.value, endsOn.value);
    return;
  }
  if (!startsOn.value || !endsOn.value) {
    quoteEl.textContent = startsOn.value ? '퇴거일을 선택해 주세요.' : '입주일과 퇴거일을 선택해 주세요.';
    return;
  }
  const quote = quoteLease(startsOn.value, endsOn.value);
  if (!quote.ok) {
    quoteEl.textContent = quote.reason === 'too_short'
      ? `${quote.days}일을 선택하셨습니다. 최소 7일부터 신청할 수 있습니다.`
      : '퇴거일은 입주일 뒤여야 합니다.';
    return;
  }
  if (!rangeIsOpen(periods, startsOn.value, endsOn.value)) {
    quoteEl.textContent = '선택한 기간에 이미 계약된 날짜가 있습니다. 다른 날짜를 골라 주세요.';
    return;
  }
  quoteEl.textContent = `${describeQuote(quote)}. 계약 시 보증금 ${formatWon(quote.deposit)}(반환)과 퇴거 청소비 ${formatWon(quote.cleaning)}(1회)가 더해지고, 공과금은 별도입니다.`;
}

function updateExtensionQuote(startsOn, endsOn) {
  if (!startsOn) {
    quoteEl.textContent = '현재 계약이 끝나는 다음 날(회색 구간 바로 뒤)을 눌러 연장 시작일을 고르세요.';
    return;
  }
  if (!isExtensionStart(periods, startsOn)) {
    quoteEl.textContent = '연장은 현재 계약이 끝나는 다음 날부터 신청할 수 있습니다.';
    return;
  }
  if (!endsOn) {
    quoteEl.textContent = '연장 마지막 날을 선택해 주세요.';
    return;
  }
  const quote = quoteExtension(startsOn, endsOn);
  if (!quote.ok) {
    quoteEl.textContent = quote.reason === 'too_long'
      ? `연장은 ${EXTENSION_MAX_DAYS}일까지 신청할 수 있습니다. 더 길면 '처음 신청'을 이용해 주세요.`
      : '마지막 날은 시작일과 같거나 그 뒤여야 합니다.';
    return;
  }
  if (!rangeIsOpen(periods, startsOn, endsOn)) {
    quoteEl.textContent = '선택한 기간에 이미 계약된 날짜가 있습니다. 다른 날짜를 골라 주세요.';
    return;
  }
  quoteEl.textContent = `${describeQuote(quote)}. 보증금과 청소비는 추가되지 않고, 공과금은 별도입니다. 승인 여부는 확인 후 연락드립니다.`;
}

function syncKind() {
  const extension = isExtension();
  extensionHint.hidden = !extension;
  startLabel.textContent = extension ? '연장 시작일' : '입주일';
  endLabel.textContent = extension ? '연장 마지막 날' : '퇴거일';
  form.elements.startsOn.value = '';
  form.elements.endsOn.value = '';
  showStatus('', 'info');
  render();
}

function selectedDays(startsOn, endsOn) {
  const start = toDayNumber(startsOn);
  const end = toDayNumber(endsOn);
  if (start === null) return [];
  if (end === null || end < start || end - start > 366) return [startsOn];
  return Array.from({ length: end - start + 1 }, (_, i) => fromDayNumber(start + i));
}

function render() {
  const { startsOn, endsOn } = form.elements;
  renderCalendarMonths(grid, {
    periods,
    today,
    locale: 'ko',
    months: 3,
    onDayClick,
    selected: selectedDays(startsOn.value, endsOn.value)
  });
  updateQuote();
}

function onDayClick(date) {
  const { startsOn, endsOn } = form.elements;
  if (isExtension() && (!startsOn.value || endsOn.value) && !isExtensionStart(periods, date)) {
    showStatus('연장은 현재 계약이 끝나는 다음 날부터 선택할 수 있습니다.', 'error');
    return;
  }
  // First click (or one before the chosen start) sets 입주일; the next sets 퇴거일.
  if (!startsOn.value || endsOn.value || toDayNumber(date) < toDayNumber(startsOn.value)) {
    startsOn.value = date;
    endsOn.value = '';
  } else {
    endsOn.value = date;
  }
  showStatus('', 'info');
  render();
}

async function submit(event) {
  event.preventDefault();
  if (form.elements.website.value) {
    form.reset();
    showStatus('신청이 접수되었습니다. 확인 후 연락드리겠습니다.', 'success');
    return;
  }
  let payload;
  try {
    payload = buildLeaseRequestPayload({
      startsOn: form.elements.startsOn.value,
      endsOn: form.elements.endsOn.value,
      name: form.elements.name.value,
      phone: form.elements.phone.value,
      message: form.elements.message.value,
      privacyConsent: form.elements.privacyConsent.checked,
      kind: form.elements.kind.value
    }, periods);
  } catch (error) {
    showStatus(error.message, 'error');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showStatus('신청을 접수하고 있습니다.', 'pending');
  try {
    const result = await createInquiry(payload);
    if (!result?.success || result.persisted !== true) throw new Error('INQUIRY_NOT_PERSISTED');
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'lease_request_complete', { days: payload.metadata.lease_request.days });
    }
    const wasExtension = payload.metadata.lease_request.kind === 'extension';
    form.reset();
    syncKind();
    showStatus(wasExtension
      ? '연장 신청이 접수되었습니다. 기존 계약을 확인한 뒤 승인 또는 거절 여부를 연락드리겠습니다. 승인과 입금 전까지는 확정되지 않습니다.'
      : '신청이 접수되었습니다. 일정과 금액을 확인해 연락드리겠습니다. 계약서 작성과 입금 전까지는 확정되지 않습니다.', 'success');
  } catch (error) {
    console.error('[lease-request] submission failed', error);
    showStatus('접수 중 문제가 생겼습니다. 잠시 후 다시 시도하거나 전화해 주세요.', 'error');
  } finally {
    button.disabled = false;
  }
}

async function init() {
  const listingId = calendar?.dataset.shortstayCalendar;
  if (!form || !grid || !quoteEl || !statusEl || !extensionHint || !startLabel || !endLabel || !form.elements.kind || !LISTING_UUID.test(listingId || '')) return;
  today = seoulToday();
  try {
    periods = await fetchPeriods([listingId], today);
  } catch (error) {
    console.warn('[lease-request] availability unavailable', error);
    return;
  }
  form.elements.startsOn.min = today;
  form.elements.endsOn.min = today;
  form.addEventListener('change', (event) => {
    if (event.target.name === 'startsOn' || event.target.name === 'endsOn') render();
  });
  form.addEventListener('submit', submit);
  form.querySelectorAll('input[name="kind"]').forEach((radio) => radio.addEventListener('change', syncKind));
  render();
  calendar.hidden = false;
  section.hidden = false;
  document.querySelectorAll('[data-lease-request-link]').forEach((link) => { link.hidden = false; });
}

init();
