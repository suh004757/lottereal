import { buildInquiryAnalyticsEvent, buildInquiryPayload, normalizePhone } from './inquiryMvp.js';

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

const EN_LABELS = Object.freeze({
  inquiryType: {
    callback: 'Call request',
    listing: 'Property inquiry',
    consultation: 'General inquiry'
  },
  sourceChannel: {
    website: 'Lotte Real Estate website',
    zigbang: 'Zigbang',
    dabang: 'Dabang',
    naver: 'Naver or another online listing',
    walkin: 'Office visit',
    other: 'Other'
  },
  callbackTime: {
    anytime: 'Any time',
    'today-morning': 'This morning',
    'today-afternoon': 'This afternoon',
    'weekday-evening': 'Weekday evening',
    tomorrow: 'Tomorrow'
  }
});

const EN_FIELD_LABELS = Object.freeze({
  externalListingRef: 'Listing reference',
  name: 'Name',
  phone: 'Phone number'
});

const COPY = Object.freeze({
  ko: Object.freeze({
    introTitle: '문의 접수 도우미', introText: '몇 가지만 알려주시면 담당자가 확인 후 전화드립니다.',
    listingContext: '문의 매물', received: '접수되었습니다. 확인 후 연락드리겠습니다.',
    invalidPhone: '연락처를 확인해 주세요.', listingRequired: '직방·다방 매물번호를 적어주세요.',
    consentRequired: '문의 접수를 위해 개인정보 수집 동의가 필요합니다.', consentAnswer: '동의함', skipped: '건너뜀',
    submitting: '문의 내용을 안전하게 접수하고 있습니다.', successStatus: '접수되었습니다. 담당자가 확인 후 희망 시간에 전화드립니다.',
    failure: '접수 중 문제가 생겼습니다. 잠시 후 다시 시도하거나 전화해 주세요.',
    next: '다음', skip: '건너뛰기', optional: '선택 입력', phonePlaceholder: '010-1234-5678',
    listingPlaceholder: '매물번호가 있으면 적어주세요', listingRequiredPlaceholder: '예: 12345678',
    messageLabel: '추가 문의 내용', messagePlaceholder: '예산, 입주일, 필요 면적, 요청 자료 등 필요한 내용만 적어주세요.',
    consent: '문의 응대를 위한 개인정보 수집·이용에 동의합니다.', privacyLink: '개인정보처리방침 보기',
    consentSubmit: '동의하고 내용 확인', reviewInquiry: '문의', reviewSource: '유입', reviewListing: '매물번호',
    reviewPhone: '연락처', reviewTime: '연락시간', reviewDetails: '요청조건', submit: '이 내용으로 문의 접수',
    submittingButton: '접수 중…', restart: '처음부터 다시', successTitle: '문의가 접수됐습니다', newInquiry: '새 문의 남기기',
    phoneEntered: '입력됨', privacyAuthority: '',
    questions: Object.freeze({
      inquiryType: '어떤 도움이 필요하신가요?', sourceChannel: '어디에서 보고 문의하시나요?',
      externalListingRef: '확인할 매물번호가 있나요?', name: '성함을 알려주세요. 원치 않으면 건너뛸 수 있어요.',
      phone: '연락받을 전화번호를 적어주세요.', callbackTime: '언제 전화드리면 편하신가요?',
      message: '추가로 전할 내용이 있나요?', privacyConsent: '마지막으로 개인정보 수집 동의가 필요합니다.',
      review: '입력한 내용을 확인해 주세요.', fallback: '문의 내용을 알려주세요.'
    })
  }),
  en: Object.freeze({
    introTitle: 'English guided inquiry', introText: 'Answer a few questions and our team will review your request.',
    listingContext: 'Property', received: 'Your inquiry has been received.',
    invalidPhone: 'Please enter a Korean phone number, using +82 if needed.', listingRequired: 'Please enter the Zigbang or Dabang listing reference.',
    consentRequired: 'Consent is required before the inquiry can be submitted.', consentAnswer: 'Agreed', skipped: 'Skipped',
    submitting: 'Submitting your inquiry securely.', successStatus: 'Your inquiry has been received. Our team will review it and contact you at the preferred time.',
    failure: 'We could not save the inquiry. Please try again later or use the contact details on this page.',
    next: 'Next', skip: 'Skip', optional: 'Optional', phonePlaceholder: '+82 10 1234 5678',
    listingPlaceholder: 'Enter a listing reference if you have one', listingRequiredPlaceholder: 'Example: 12345678',
    messageLabel: 'Additional inquiry details', messagePlaceholder: 'Share only what is needed: dates, budget, deposit, area, property type, furniture or pets. Do not enter passport or bank details.',
    consent: 'I agree to the collection and use of my phone number, inquiry category, source and preferred contact time, plus any optional name or message, to answer this inquiry. Records are retained for one year.',
    privacyLink: 'View the Korean Privacy Policy', consentSubmit: 'Agree and review', reviewInquiry: 'Inquiry', reviewSource: 'Source',
    reviewListing: 'Listing reference', reviewPhone: 'Phone', reviewTime: 'Contact time', reviewDetails: 'Requirements',
    submit: 'Submit this inquiry', submittingButton: 'Submitting…', restart: 'Start again', successTitle: 'Inquiry received',
    newInquiry: 'Send another inquiry', phoneEntered: 'Entered', privacyAuthority: ' The Korean policy is authoritative.',
    questions: Object.freeze({
      inquiryType: 'What can we help you with?', sourceChannel: 'Where did you find us or the property?',
      externalListingRef: 'Do you have a listing reference?', name: 'What name should we use? You may skip this.',
      phone: 'What Korean phone number can we use, including +82 if needed?', callbackTime: 'When is a convenient time to contact you?',
      message: 'What accommodation or rental issue should we review?', privacyConsent: 'Please review the privacy notice before submitting.',
      review: 'Please check the details before submission.', fallback: 'Please tell us what you need.'
    })
  })
});

const modalityTrackers = new WeakMap();

export const INQUIRY_FOCUSABLE_SELECTOR = [
  'button[data-chat-choice]:not([disabled])',
  'input:not([type="hidden"]):not(.lr-inquiry-chat__honeypot):not([aria-hidden="true"]):not([tabindex="-1"]):not([disabled])',
  'textarea:not([aria-hidden="true"]):not([tabindex="-1"]):not([disabled])',
  'button[data-chat-restart]:not([disabled])',
  'button[type="submit"]:not([disabled])'
].join(', ');

export function createInputModalityTracker(target) {
  if (!target?.addEventListener) return () => 'programmatic';
  if (modalityTrackers.has(target)) return modalityTrackers.get(target);
  let modality = 'programmatic';
  target.addEventListener('pointerdown', () => { modality = 'pointer'; }, true);
  target.addEventListener('keydown', () => { modality = 'keyboard'; }, true);
  const getModality = () => modality;
  modalityTrackers.set(target, getModality);
  return getModality;
}

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

export function shouldAutofocusInquiryControl({ historyLength = 0, modality = 'programmatic' } = {}) {
  return historyLength > 0 && modality === 'keyboard';
}

export function mountInquiryChat(container, { locale = 'ko' } = {}) {
  if (!container || container.dataset.inquiryChatReady === 'true') return;
  container.dataset.inquiryChatReady = 'true';

  const activeLocale = locale === 'en' ? 'en' : 'ko';
  const labels = activeLocale === 'en' ? EN_LABELS : LABELS;
  const fieldLabels = activeLocale === 'en' ? EN_FIELD_LABELS : FIELD_LABELS;
  const copy = COPY[activeLocale];
  const view = { locale: activeLocale, labels, fieldLabels, copy };
  const state = freshState();
  const getInputModality = createInputModalityTracker(document);
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
    const inquiryDraft = String(event.detail?.inquiryDraft || '').trim().slice(0, 1000);
    Object.assign(state, freshState());
    if (listingId) applyListingContext({ listingId, listingTitle, inquiryDraft });
    render();
  }

  function applyListingContext(context) {
    state.listingContext = context;
    state.values.inquiryType = 'listing';
    state.values.sourceChannel = 'website';
    state.values.message = context.inquiryDraft || '';
    state.step = 'name';
    state.history = [
      { question: questionFor('inquiryType', view), answer: labels.inquiryType.listing },
      { question: activeLocale === 'en' ? 'Which property are you asking about?' : '어떤 매물을 보고 계신가요?', answer: context.listingTitle }
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
      state.status = copy.received;
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
    if (field === 'phone') {
      try {
        normalizePhone(value, { international: activeLocale === 'en' });
      } catch {
        state.status = copy.invalidPhone;
        render();
        return;
      }
    }
    if (field === 'externalListingRef' && ['zigbang', 'dabang'].includes(state.values.sourceChannel) && !value) {
      state.status = copy.listingRequired;
      render();
      return;
    }
    if (field === 'privacyConsent' && data.get('privacyConsent') !== 'yes') {
      state.status = copy.consentRequired;
      render();
      return;
    }

    const storedValue = field === 'privacyConsent' ? true : value;
    const displayValue = field === 'privacyConsent' ? copy.consentAnswer : (value || copy.skipped);
    answer(field, storedValue, displayValue);
  }

  function answer(field, value, displayValue) {
    if (!field) return;
    state.values[field] = value;
    state.history.push({ question: questionFor(field, view), answer: displayValue });
    state.status = '';
    state.step = nextInquiryChatStep(state.step, state.values);
    render();
  }

  async function submitInquiry() {
    if (state.submitting) return;
    state.submitting = true;
    state.status = copy.submitting;
    render();

    try {
      const payload = buildInquiryPayload(state.values, { locale: activeLocale });
      payload.metadata.entry_point = activeLocale === 'en' ? 'guided-inquiry-chat-en' : 'guided-inquiry-chat';
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
      state.status = copy.successStatus;
      container.dispatchEvent(new CustomEvent('inquiry-chat-success', { bubbles: true }));
    } catch (error) {
      console.error('[Inquiry Chat] submission failed', error);
      state.status = copy.failure;
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
          <div><strong>${escapeHtml(copy.introTitle)}</strong><p>${escapeHtml(copy.introText)}</p></div>
        </div>
        ${renderListingContext(state.listingContext, view)}
        ${renderHistory(state.history)}
        ${state.complete ? renderSuccess(state.status, view) : renderPrompt(state, view)}
      </div>
    `;
    const firstControl = container.querySelector(INQUIRY_FOCUSABLE_SELECTOR);
    const modality = getInputModality();
    if (firstControl && shouldAutofocusInquiryControl({ historyLength: state.history.length, modality })) {
      window.setTimeout(() => firstControl.focus({ preventScroll: true }), 0);
    } else if (state.history.length) {
      const safeFocusTarget = container.querySelector('.lr-inquiry-chat__prompt, .lr-inquiry-chat__success');
      window.setTimeout(() => safeFocusTarget?.focus({ preventScroll: true }), 0);
    }
  }
}

function renderListingContext(context, { copy }) {
  if (!context?.listingTitle) return '';
  return `<p class="lr-inquiry-chat__listing-context"><span>${escapeHtml(copy.listingContext)}</span><strong>${escapeHtml(context.listingTitle)}</strong></p>`;
}

function renderHistory(history) {
  if (!history.length) return '';
  return `<ol class="lr-inquiry-chat__history">${history.map((item) => `
    <li><p>${escapeHtml(item.question)}</p><span>${escapeHtml(item.answer)}</span></li>
  `).join('')}</ol>`;
}

function renderPrompt(state, view) {
  const status = state.status ? `<p class="lr-inquiry-chat__status" role="${state.submitting ? 'status' : 'alert'}">${escapeHtml(state.status)}</p>` : '';
  return `
    <section class="lr-inquiry-chat__prompt" aria-live="polite" tabindex="-1">
      <p class="lr-inquiry-chat__bot">${escapeHtml(questionFor(state.step, view))}</p>
      ${renderControls(state, view)}
      ${status}
    </section>
  `;
}

function renderControls(state, view) {
  const { labels, copy } = view;
  if (state.step === 'inquiryType') return renderChoices('inquiryType', labels.inquiryType);
  if (state.step === 'sourceChannel') return renderChoices('sourceChannel', labels.sourceChannel);
  if (state.step === 'callbackTime') return renderChoices('callbackTime', labels.callbackTime);
  if (state.step === 'externalListingRef') {
    const required = ['zigbang', 'dabang'].includes(state.values.sourceChannel);
    return renderTextForm('externalListingRef', 'text', required ? copy.listingRequiredPlaceholder : copy.listingPlaceholder, !required, '', view);
  }
  if (state.step === 'name') return renderTextForm('name', 'text', copy.optional, true, '', view);
  if (state.step === 'phone') return renderTextForm('phone', 'tel', copy.phonePlaceholder, false, 'tel', view);
  if (state.step === 'message') return renderMessageForm(state.values.message, view);
  if (state.step === 'privacyConsent') return renderConsentForm(view);
  return renderReview(state, view);
}

function renderChoices(field, choices) {
  return `<div class="lr-inquiry-chat__choices">${Object.entries(choices).map(([value, label]) => `
    <button type="button" data-field="${field}" data-chat-choice="${value}">${escapeHtml(label)}</button>
  `).join('')}</div>`;
}

function renderTextForm(field, type, placeholder, allowSkip, inputMode = '', { fieldLabels, copy }) {
  return `
    <form data-chat-form data-field="${field}" class="lr-inquiry-chat__form">
      <input name="${field}" type="${type}" maxlength="80" aria-label="${escapeHtml(fieldLabels[field])}" ${inputMode ? `inputmode="${inputMode}"` : ''} placeholder="${escapeHtml(placeholder)}" ${allowSkip ? '' : 'required'} autocomplete="${field === 'name' ? 'name' : field === 'phone' ? 'tel' : 'off'}">
      <div><button type="submit">${escapeHtml(copy.next)}</button>${allowSkip ? `<button type="submit" class="is-secondary" name="${field}" value="">${escapeHtml(copy.skip)}</button>` : ''}</div>
    </form>
  `;
}

function renderMessageForm(initialValue = '', { copy }) {
  return `
    <form data-chat-form data-field="message" class="lr-inquiry-chat__form">
      <textarea name="message" maxlength="1000" rows="5" aria-label="${escapeHtml(copy.messageLabel)}" placeholder="${escapeHtml(copy.messagePlaceholder)}">${escapeHtml(initialValue)}</textarea>
      <div><button type="submit">${escapeHtml(copy.next)}</button><button type="submit" class="is-secondary" name="message" value="">${escapeHtml(copy.skip)}</button></div>
    </form>
  `;
}

function renderConsentForm({ copy }) {
  return `
    <form data-chat-form data-field="privacyConsent" class="lr-inquiry-chat__consent">
      <label><input type="checkbox" name="privacyConsent" value="yes" required> ${escapeHtml(copy.consent + copy.privacyAuthority)}</label>
      <a href="privacy.html" target="_blank" rel="noreferrer">${escapeHtml(copy.privacyLink)}</a>
      <button type="submit">${escapeHtml(copy.consentSubmit)}</button>
    </form>
  `;
}

function renderReview(state, { labels, copy }) {
  const values = state.values;
  return `
    <form data-chat-form data-field="review" class="lr-inquiry-chat__review">
      <dl>
        <div><dt>${escapeHtml(copy.reviewInquiry)}</dt><dd>${escapeHtml(labels.inquiryType[values.inquiryType] || '-')}</dd></div>
        <div><dt>${escapeHtml(copy.reviewSource)}</dt><dd>${escapeHtml(labels.sourceChannel[values.sourceChannel] || '-')}</dd></div>
        ${values.externalListingRef ? `<div><dt>${escapeHtml(copy.reviewListing)}</dt><dd>${escapeHtml(values.externalListingRef)}</dd></div>` : ''}
        <div><dt>${escapeHtml(copy.reviewPhone)}</dt><dd>${escapeHtml(maskPhoneForReview(values.phone, copy))}</dd></div>
        <div><dt>${escapeHtml(copy.reviewTime)}</dt><dd>${escapeHtml(labels.callbackTime[values.callbackTime] || '-')}</dd></div>
        ${values.message ? `<div><dt>${escapeHtml(copy.reviewDetails)}</dt><dd>${escapeHtml(values.message)}</dd></div>` : ''}
      </dl>
      <input name="website" type="text" tabindex="-1" autocomplete="off" class="lr-inquiry-chat__honeypot" aria-hidden="true">
      <button type="submit" ${state.submitting ? 'disabled' : ''}>${escapeHtml(state.submitting ? copy.submittingButton : copy.submit)}</button>
      <button type="button" class="is-secondary" data-chat-restart>${escapeHtml(copy.restart)}</button>
    </form>
  `;
}

function renderSuccess(message, { copy }) {
  return `
    <section class="lr-inquiry-chat__success" role="status" tabindex="-1">
      <span aria-hidden="true">✓</span><h3>${escapeHtml(copy.successTitle)}</h3><p>${escapeHtml(message)}</p>
      <button type="button" data-chat-restart>${escapeHtml(copy.newInquiry)}</button>
    </section>
  `;
}

function questionFor(step, { copy } = { copy: COPY.ko }) {
  return copy.questions[step] || copy.questions.fallback;
}

function maskPhoneForReview(value, copy = COPY.ko) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `***-****-${digits.slice(-4)}` : copy.phoneEntered;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
