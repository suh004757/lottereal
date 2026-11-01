// Admin "입주 일정" panel: add or remove leased date ranges for one listing.
// The public calendar and move-in text read the same table, so a change here
// shows up on the listing pages on the next page load.
import {
  addUnavailablePeriod,
  deleteUnavailablePeriod,
  listUnavailablePeriods
} from './services/backendAdapter.js';
import { refreshAdminSession } from './services/authService.js';
import { formatAvailability, nextAvailableDate, seoulToday, toDayNumber } from './utils/shortStayAvailability.mjs';
import { renderCalendarMonths } from './shortStayCalendarView.mjs';

const panel = document.getElementById('availabilityPanel');
const title = document.getElementById('availabilityTitle');
const calendarEl = panel?.querySelector('[data-availability-calendar]');
const listEl = panel?.querySelector('[data-availability-list]');
const form = document.getElementById('availabilityForm');
const message = document.getElementById('availabilityMessage');

let activeListing = null;
let periods = [];
let loadGeneration = 0;

function setMessage(text = '', status = 'info') {
  if (!message) return;
  message.textContent = text;
  message.dataset.status = status;
  message.hidden = !text;
}

function selectedDates() {
  return [form?.elements.startsOn.value, form?.elements.endsOn.value].filter(Boolean);
}

function onDayClick(date) {
  if (!form) return;
  const { startsOn, endsOn } = form.elements;
  // First click (or a click before the chosen start) sets 입주일; the next sets 퇴실일.
  if (!startsOn.value || endsOn.value || toDayNumber(date) < toDayNumber(startsOn.value)) {
    startsOn.value = date;
    endsOn.value = '';
  } else {
    endsOn.value = date;
  }
  render();
}

function render() {
  const today = seoulToday();
  if (calendarEl) {
    renderCalendarMonths(calendarEl, { periods, today, locale: 'ko', months: 3, onDayClick, selected: selectedDates() });
  }
  if (!listEl) return;
  listEl.replaceChildren();
  const summary = document.createElement('li');
  summary.textContent = `매물 페이지 표시: ${formatAvailability(nextAvailableDate(periods, today), today, 'ko', 'long')}`;
  listEl.appendChild(summary);
  periods.forEach((period) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${period.starts_on} ~ ${period.ends_on}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-btn admin-btn--ghost';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => removePeriod(period.id, remove));
    li.append(label, remove);
    listEl.appendChild(li);
  });
}

async function loadPeriods() {
  if (!activeListing) return;
  const generation = ++loadGeneration;
  try {
    const rows = await listUnavailablePeriods(activeListing.id);
    if (generation !== loadGeneration) return;
    periods = rows;
    render();
  } catch (err) {
    console.error('입주 일정 불러오기 실패', err);
    if (generation === loadGeneration) setMessage('입주 일정을 불러오지 못했습니다.', 'error');
  }
}

async function removePeriod(id, button) {
  button.disabled = true;
  try {
    await refreshAdminSession();
    await deleteUnavailablePeriod(id);
    setMessage('기간을 삭제했습니다.', 'success');
    await loadPeriods();
  } catch (err) {
    console.error('입주 일정 삭제 실패', err);
    button.disabled = false;
    setMessage('삭제하지 못했습니다. 다시 시도해 주세요.', 'error');
  }
}

async function submitPeriod(event) {
  event.preventDefault();
  if (!activeListing || !form) return;
  const startsOn = form.elements.startsOn.value;
  const endsOn = form.elements.endsOn.value;
  if (!startsOn || !endsOn || toDayNumber(endsOn) < toDayNumber(startsOn)) {
    setMessage('퇴실일은 입주일과 같거나 그 뒤여야 합니다.', 'error');
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await refreshAdminSession();
    await addUnavailablePeriod(activeListing.id, startsOn, endsOn);
    form.reset();
    setMessage('기간을 추가했습니다. 매물 페이지에 바로 반영됩니다.', 'success');
    await loadPeriods();
  } catch (err) {
    console.error('입주 일정 추가 실패', err);
    setMessage('추가하지 못했습니다. 다시 시도해 주세요.', 'error');
  } finally {
    submit.disabled = false;
  }
}

export function openAvailabilityPanel(listing) {
  if (!panel || !listing?.id) return;
  activeListing = listing;
  periods = [];
  form?.reset();
  setMessage('');
  if (title) title.textContent = `입주 일정 · ${listing.title || ''}`;
  panel.hidden = false;
  render();
  loadPeriods();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function bindAvailabilityPanel() {
  form?.addEventListener('submit', submitPeriod);
  form?.addEventListener('change', render);
  document.getElementById('closeAvailabilityPanel')?.addEventListener('click', () => {
    activeListing = null;
    loadGeneration += 1;
    if (panel) panel.hidden = true;
  });
}
