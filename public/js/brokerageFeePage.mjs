import { calculateBrokerageFee } from './brokerageFeeCalculator.mjs';

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
      document.querySelector('[data-result-fee]').textContent = won.format(result.ceilingFee);
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
