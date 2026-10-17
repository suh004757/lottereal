import { calculateBrokerageFee, housingFeeBands } from './brokerageFeeCalculator.mjs';

const WON_PER_MANWON = 10_000;
const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

export function manWonToWon(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    throw new RangeError('금액은 정수 만원 단위로 입력해 주세요.');
  }
  return amount * WON_PER_MANWON;
}

export function formatKoreanAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return '금액을 입력해 주세요.';
  const eok = Math.floor(value / 100_000_000);
  const remainder = value % 100_000_000;
  const man = Math.floor(remainder / 10_000);
  const parts = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  return `${parts.join(' ')}원`;
}

export function formatBandBoundary(value) {
  if (value >= 100_000_000) return `${value / 100_000_000}억`;
  return `${value / 10_000_000}천만`;
}

export function bandPosition(bands, amount) {
  const index = bands.findIndex((band) => amount < band.below);
  const lower = index > 0 ? bands[index - 1].below : 0;
  const upper = Number.isFinite(bands[index].below) ? bands[index].below : lower * 2;
  return { index, offset: Math.min(Math.max((amount - lower) / (upper - lower), 0.04), 0.96) };
}

function renderBands(result, transactionType, propertyType) {
  const wrap = document.querySelector('[data-result-bands]');
  const trackList = document.querySelector('[data-result-band-track]');
  const note = document.querySelector('[data-result-band-note]');
  if (!wrap || !trackList || !note) return;
  const bands = propertyType === 'housing' ? housingFeeBands(transactionType) : null;
  trackList.replaceChildren();
  if (!bands) {
    wrap.hidden = true;
    return;
  }
  const { index, offset } = bandPosition(bands, result.transactionAmount);
  bands.forEach((band, i) => {
    const item = document.createElement('li');
    item.className = i === index ? 'is-active' : '';
    const rate = document.createElement('strong');
    rate.textContent = `${(band.rate * 100).toFixed(1)}%`;
    const range = document.createElement('span');
    const lower = i > 0 ? formatBandBoundary(bands[i - 1].below) : '';
    range.textContent = Number.isFinite(band.below) ? `${lower}~${formatBandBoundary(band.below)}` : `${lower}~`;
    item.append(rate, range);
    if (i === index) {
      const marker = document.createElement('i');
      marker.className = 'fee-bands__marker';
      marker.style.left = `${(offset * 100).toFixed(1)}%`;
      item.append(marker);
    }
    trackList.append(item);
  });
  const capped = result.cap !== null && Math.floor(result.transactionAmount * result.rate) > result.cap;
  note.textContent = capped
    ? `이 구간은 한도액 ${won.format(result.cap)}이 적용되어, 요율 계산값보다 상한액이 낮아졌습니다.`
    : `${(result.rate * 100).toFixed(1)}% 구간에 해당합니다. 금액이 다음 구간으로 넘어가면 요율이 바뀝니다.`;
  wrap.hidden = false;
}

function countUp(node, target) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const resultRegion = document.querySelector('#fee-result');
  if (reduce || target <= 0) {
    node.textContent = won.format(target);
    return;
  }
  resultRegion?.setAttribute('aria-busy', 'true');
  const start = performance.now();
  const duration = 800;
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    node.textContent = won.format(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(step);
    else resultRegion?.setAttribute('aria-busy', 'false');
  };
  requestAnimationFrame(step);
}

function track(name) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, { page_path: window.location.pathname, tool_name: 'brokerage_fee' });
}

function init() {
  const form = document.querySelector('#brokerage-fee-form');
  if (!form) return;
  const saleFields = [...document.querySelectorAll('[data-sale-fields]')];
  const rentFields = [...document.querySelectorAll('[data-rent-fields]')];
  const resultEmpty = document.querySelector('[data-result-empty]');
  const resultContent = document.querySelector('[data-result-content]');
  const error = document.querySelector('#fee-form-error');
  let started = false;

  function selected(name) {
    return form.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function updateMode() {
    const isSale = selected('transactionType') === 'sale';
    saleFields.forEach((field) => { field.hidden = !isSale; });
    rentFields.forEach((field) => { field.hidden = isSale; });
    form.querySelector('#sale-price').required = isSale;
    form.querySelector('#deposit').required = !isSale;
  }

  function updateAmountHint(input) {
    const target = document.querySelector(`[data-korean-amount="${input.id}"]`);
    if (!target) return;
    const value = Number(input.value);
    target.textContent = Number.isFinite(value) && value > 0
      ? formatKoreanAmount(value * WON_PER_MANWON)
      : target.dataset.defaultText || '금액을 입력해 주세요.';
  }

  document.querySelectorAll('[data-korean-amount]').forEach((node) => {
    node.dataset.defaultText = node.textContent;
  });

  form.addEventListener('input', (event) => {
    if (!started) { track('brokerage_fee_calculator_start'); started = true; }
    if (event.target.matches('input[type="number"]')) updateAmountHint(event.target);
    if (event.target.name === 'transactionType') updateMode();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    try {
      const propertyType = selected('propertyType');
      const transactionType = selected('transactionType');
      const input = { propertyType, transactionType };
      if (transactionType === 'sale') {
        input.price = manWonToWon(form.elements.salePrice.value);
      } else {
        input.deposit = manWonToWon(form.elements.deposit.value || 0);
        input.monthlyRent = manWonToWon(form.elements.monthlyRent.value || 0);
      }
      const result = calculateBrokerageFee(input);
      countUp(document.querySelector('[data-result-fee]'), result.ceilingFee);
      document.querySelector('[data-result-vat]').textContent = won.format(result.vatAtTenPercent);
      document.querySelector('[data-result-total-with-vat]').textContent = won.format(result.totalWithVatAtTenPercent);
      document.querySelector('[data-result-amount]').textContent = won.format(result.transactionAmount);
      document.querySelector('[data-result-rate]').textContent = `${(result.rate * 100).toFixed(1)}%`;
      document.querySelector('[data-result-cap]').textContent = result.cap === null ? '별도 한도 없음' : won.format(result.cap);
      const formulaRow = document.querySelector('[data-result-formula-row]');
      formulaRow.hidden = result.monthlyMultiplier === null;
      if (result.monthlyMultiplier !== null) {
        document.querySelector('[data-result-formula]').textContent = `보증금 + 월세 × ${result.monthlyMultiplier}`;
      }
      renderBands(result, transactionType, propertyType);
      resultEmpty.hidden = true;
      resultContent.hidden = false;
      document.querySelector('#fee-result')?.focus();
      track('brokerage_fee_calculator_complete');
    } catch (_) {
      error.textContent = '거래금액을 확인해 주세요. 전세는 보증금만, 월세는 보증금과 월세를 입력하면 됩니다.';
      error.hidden = false;
      error.focus?.();
    }
  });

  document.querySelector('[data-print-result]')?.addEventListener('click', () => window.print());
  document.querySelector('[data-calculator-consult]')?.addEventListener('click', () => track('brokerage_fee_consult_click'));
  updateMode();
}

if (typeof document !== 'undefined') init();
