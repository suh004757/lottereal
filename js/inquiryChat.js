import { buildInquiryAnalyticsEvent, buildInquiryPayload } from './inquiryMvp.js';

const STEP_ORDER = Object.freeze([
  'inquiryType',
  'sourceChannel',
  'externalListingRef',
  'name',
  'phone',
  'callbackTime',
  'message',
  'privacyConsent',
  'review'
]);

const LABELS = Object.freeze({
  inquiryType: {
    callback: '전화 요청',
    listing: '매물 문의',
    consultation: '일반 상담'
  },
  sourceChannel: {
    website: '롯데부동산 사이트',
    zigbang: '직방',
    dabang: '다방',
    naver: '네이버',
    walkin: '방문·현장',
    other: '기타'
  },
  callbackTime: {
    anytime: '시간 무관',
    'today-morning': '오늘 오전',
    'today-afternoon': '오늘 오후',
    'weekday-evening': '평일 저녁',
    tomorrow: '내일'
  }
});

const FIELD_LABELS = Object.freeze({
  externalListingRef: '매물번호',
  name: '이름',
  phone: '연락처'
});

export function nextInquiryChatStep(currentStep, values = {}) {
  if (currentStep === 'sourceChannel' && values.inquiryType !== 'listing') return 'name';
  const index = STEP_ORDER.indexOf(currentStep);
  return STEP_ORDER[index + 1] || 'review';
}

export function submittedChatValue(rawValue, skipped = false) {
  return skipped ? '' : String(rawValue || '').trim();
}

export function isPersistedInquiryResult(result) {
  return result?.success === true && result.persisted === true;
}

export function mountInquiryChat(container) {
  if (!container || container.dataset.inquiryChatReady === 'true') return;
  container.dataset.inquiryChatReady = 'true';

  const state = freshState();
  container.addEventListener('click', handleClick);
  container.addEventListener('submit', handleSubmit);
  container.addEventListener('inquiry-chat-context', handleListingContext);
  render();

  function freshState() {
    return {
      step: 'inquiryType',
      values: {
        inquiryType: '',
        sourceChannel: 'website',
        externalListingRef: '',
        name: '',
        phone: '',
        callbackTime: 'anytime',
        message: '',
        privacyConsent: false
      },
      history: [],
      listingContext: null,
      status: '',
      submitting: false,
      complete: false
    };
  }

  function reset() {
    const listingContext = state.listingContext;
    Object.assign(state, freshState());
    if (listingContext) applyListingContext(listingContext);
    render();
  }

  function handleListingContext(event) {
    const listingId = String(event.detail?.listingId || '').trim().slice(0, 80);
    const listingTitle = String(event.detail?.listingTitle || '롯데부동산 매물').trim().slice(0, 160);
    Object.assign(state, freshState());
    if (listingId) applyListingContext({ listingId, listingTitle });
    render();
  }

  function applyListingContext(context) {
    state.listingContext = context;
    state.values.inquiryType = 'listing';
    state.values.sourceChannel = 'website';
    state.step = 'name';
    state.history = [
      { question: questionFor('inquiryType'), answer: '매물 문의' },
      { question: '어떤 매물을 보고 계신가요?', answer: context.listingTitle }
    ];
  }

  function handleClick(event) {
    const choice = event.target.closest('button[data-chat-choice]');
    if (choice) {
      answer(choice.dataset.field, choice.dataset.chatChoice, choice.textContent.trim());
      return;
    }
    if (event.target.closest('[data-chat-restart]')) reset();
  }

  function handleSubmit(event) {
    const form = event.target.closest('form[data-chat-form]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    if (data.get('website')) {
      state.complete = true;
      state.status = '접수되었습니다. 확인 후 연락드리겠습니다.';
      render();
      return;
    }

    if (state.step === 'review') {
      submitInquiry();
      return;
    }

    const field = form.dataset.field;
    const skipped = event.submitter?.classList.contains('is-secondary') === true;
    const value = submittedChatValue(data.get(field), skipped);
    if (field === 'phone' && !/^\d{9,11}$/.test(value.replace(/\D/g, ''))) {
      state.status = '연락처를 확인해 주세요.';
      render();
      return;
    }
    if (field === 'externalListingRef' && ['zigbang', 'dabang'].includes(state.values.sourceChannel) && !value) {
      state.status = '직방·다방 매물번호를 적어주세요.';
      render();
      return;
    }
    if (field === 'privacyConsent' && data.get('privacyConsent') !== 'yes') {
      state.status = '문의 접수를 위해 개인정보 수집 동의가 필요합니다.';
      render();
      return;
    }

    const storedValue = field === 'privacyConsent' ? true : value;
    const displayValue = field === 'privacyConsent' ? '동의함' : (value || '건너뜀');
    answer(field, storedValue, displayValue);
  }

  function answer(field, value, displayValue) {
    if (!field) return;
    state.values[field] = value;
    state.history.push({ question: questionFor(field), answer: displayValue });
    state.status = '';
    state.step = nextInquiryChatStep(state.step, state.values);
    render();
  }

  async function submitInquiry() {
    if (state.submitting) return;
    state.submitting = true;
    state.status = '문의 내용을 안전하게 접수하고 있습니다.';
    render();

    try {
      const payload = buildInquiryPayload(state.values);
      payload.metadata.entry_point = 'guided-inquiry-chat';
      if (state.listingContext && state.listingContext.listingId) {
        payload.listingId = state.listingContext.listingId;
        payload.listingTitle = state.listingContext.listingTitle;
        payload.metadata.has_internal_listing_context = true;
      }
      const { createInquiry } = await import('./services/backendAdapter.js');
      const result = await createInquiry(payload);
      if (!isPersistedInquiryResult(result)) throw new Error('INQUIRY_NOT_PERSISTED');
      const analytics = buildInquiryAnalyticsEvent(payload);
      if (typeof window.gtag === 'function') {
        window.gtag('event', analytics.name, analytics.params);
      }
      state.complete = true;
      state.status = '접수되었습니다. 담당자가 확인 후 희망 시간에 전화드립니다.';
      container.dispatchEvent(new CustomEvent('inquiry-chat-success', { bubbles: true }));
    } catch (error) {
      console.error('[Inquiry Chat] submission failed', error);
      state.status = '접수 중 문제가 생겼습니다. 잠시 후 다시 시도하거나 전화해 주세요.';
    } finally {
      state.submitting = false;
      render();
    }
  }

  function render() {
    container.innerHTML = `
      <div class="lr-inquiry-chat">
        <div class="lr-inquiry-chat__intro">
          <span aria-hidden="true">L</span>
          <div><strong>문의 접수 도우미</strong><p>몇 가지만 알려주시면 담당자가 확인 후 전화드립니다.</p></div>
        </div>
        ${renderHistory(state.history)}
        ${state.complete ? renderSuccess(state.status) : renderPrompt(state)}
      </div>
    `;
    const firstControl = container.querySelector('button[data-chat-choice], input:not([type="hidden"]), textarea, button[type="submit"]');
    if (state.history.length && firstControl) window.setTimeout(() => firstControl.focus(), 0);
  }
}

function renderHistory(history) {
  if (!history.length) return '';
  return `<ol class="lr-inquiry-chat__history">${history.map((item) => `
    <li><p>${escapeHtml(item.question)}</p><span>${escapeHtml(item.answer)}</span></li>
  `).join('')}</ol>`;
}

function renderPrompt(state) {
  const status = state.status ? `<p class="lr-inquiry-chat__status" role="${state.status.includes('접수하고') ? 'status' : 'alert'}">${escapeHtml(state.status)}</p>` : '';
  return `
    <section class="lr-inquiry-chat__prompt" aria-live="polite">
      <p class="lr-inquiry-chat__bot">${escapeHtml(questionFor(state.step))}</p>
      ${renderControls(state)}
      ${status}
    </section>
  `;
}

function renderControls(state) {
  if (state.step === 'inquiryType') return renderChoices('inquiryType', LABELS.inquiryType);
  if (state.step === 'sourceChannel') return renderChoices('sourceChannel', LABELS.sourceChannel);
  if (state.step === 'callbackTime') return renderChoices('callbackTime', LABELS.callbackTime);
  if (state.step === 'externalListingRef') {
    const required = ['zigbang', 'dabang'].includes(state.values.sourceChannel);
    return renderTextForm('externalListingRef', 'text', required ? '예: 12345678' : '매물번호가 있으면 적어주세요', !required);
  }
  if (state.step === 'name') return renderTextForm('name', 'text', '선택 입력', true);
  if (state.step === 'phone') return renderTextForm('phone', 'tel', '010-1234-5678', false, 'tel');
  if (state.step === 'message') return renderMessageForm();
  if (state.step === 'privacyConsent') return renderConsentForm();
  return renderReview(state);
}

function renderChoices(field, choices) {
  return `<div class="lr-inquiry-chat__choices">${Object.entries(choices).map(([value, label]) => `
    <button type="button" data-field="${field}" data-chat-choice="${value}">${escapeHtml(label)}</button>
  `).join('')}</div>`;
}

function renderTextForm(field, type, placeholder, allowSkip, inputMode = '') {
  return `
    <form data-chat-form data-field="${field}" class="lr-inquiry-chat__form">
      <input name="${field}" type="${type}" maxlength="80" aria-label="${escapeHtml(FIELD_LABELS[field])}" ${inputMode ? `inputmode="${inputMode}"` : ''} placeholder="${escapeHtml(placeholder)}" ${allowSkip ? '' : 'required'} autocomplete="${field === 'name' ? 'name' : field === 'phone' ? 'tel' : 'off'}">
      <div><button type="submit">다음</button>${allowSkip ? `<button type="submit" class="is-secondary" name="${field}" value="">건너뛰기</button>` : ''}</div>
    </form>
  `;
}

function renderMessageForm() {
  return `
    <form data-chat-form data-field="message" class="lr-inquiry-chat__form">
      <textarea name="message" maxlength="1000" rows="3" aria-label="추가 문의 내용" placeholder="예산, 지역, 입주일 등 필요한 내용만 적어주세요."></textarea>
      <div><button type="submit">다음</button><button type="submit" class="is-secondary" name="message" value="">건너뛰기</button></div>
    </form>
  `;
}

function renderConsentForm() {
  return `
    <form data-chat-form data-field="privacyConsent" class="lr-inquiry-chat__consent">
      <label><input type="checkbox" name="privacyConsent" value="yes" required> 문의 응대를 위한 개인정보 수집·이용에 동의합니다.</label>
      <a href="privacy.html" target="_blank" rel="noreferrer">개인정보처리방침 보기</a>
      <button type="submit">동의하고 내용 확인</button>
    </form>
  `;
}

function renderReview(state) {
  const values = state.values;
  return `
    <form data-chat-form data-field="review" class="lr-inquiry-chat__review">
      <dl>
        <div><dt>문의</dt><dd>${escapeHtml(LABELS.inquiryType[values.inquiryType] || '-')}</dd></div>
        <div><dt>유입</dt><dd>${escapeHtml(LABELS.sourceChannel[values.sourceChannel] || '-')}</dd></div>
        ${values.externalListingRef ? `<div><dt>매물번호</dt><dd>${escapeHtml(values.externalListingRef)}</dd></div>` : ''}
        <div><dt>연락처</dt><dd>${escapeHtml(maskPhoneForReview(values.phone))}</dd></div>
        <div><dt>연락시간</dt><dd>${escapeHtml(LABELS.callbackTime[values.callbackTime] || '-')}</dd></div>
      </dl>
      <input name="website" type="text" tabindex="-1" autocomplete="off" class="lr-inquiry-chat__honeypot" aria-hidden="true">
      <button type="submit" ${state.submitting ? 'disabled' : ''}>${state.submitting ? '접수 중…' : '이 내용으로 문의 접수'}</button>
      <button type="button" class="is-secondary" data-chat-restart>처음부터 다시</button>
    </form>
  `;
}

function renderSuccess(message) {
  return `
    <section class="lr-inquiry-chat__success" role="status">
      <span aria-hidden="true">✓</span><h3>문의가 접수됐습니다</h3><p>${escapeHtml(message)}</p>
      <button type="button" data-chat-restart>새 문의 남기기</button>
    </section>
  `;
}

function questionFor(step) {
  return {
    inquiryType: '어떤 도움이 필요하신가요?',
    sourceChannel: '어디에서 보고 문의하시나요?',
    externalListingRef: '확인할 매물번호가 있나요?',
    name: '성함을 알려주세요. 원치 않으면 건너뛸 수 있어요.',
    phone: '연락받을 전화번호를 적어주세요.',
    callbackTime: '언제 전화드리면 편하신가요?',
    message: '추가로 전할 내용이 있나요?',
    privacyConsent: '마지막으로 개인정보 수집 동의가 필요합니다.',
    review: '입력한 내용을 확인해 주세요.'
  }[step] || '문의 내용을 알려주세요.';
}

function maskPhoneForReview(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `***-****-${digits.slice(-4)}` : '입력됨';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
