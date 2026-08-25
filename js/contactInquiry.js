import { createInquiry } from './services/backendAdapter.js';
import { buildInquiryPayload, buildInquiryAnalyticsEvent } from './inquiryMvp.js';

const form = document.querySelector('[data-inquiry-mvp-form]');
const status = document.querySelector('[data-inquiry-status]');
const listingReference = document.querySelector('[data-external-listing-field]');
const submitButton = form?.querySelector('button[type="submit"]');

if (form) {
  applyQueryPrefill();
  syncListingReference();

  form.querySelectorAll('input[name="inquiryType"]').forEach((input) => {
    input.addEventListener('change', syncListingReference);
  });
  form.elements.sourceChannel.addEventListener('change', syncListingReference);

  form.addEventListener('submit', submitInquiry);
}

function selectedInquiryType() {
  return form?.querySelector('input[name="inquiryType"]:checked')?.value || 'callback';
}

function syncListingReference() {
  if (!listingReference) return;
  const isListing = selectedInquiryType() === 'listing';
  listingReference.hidden = !isListing;
  const input = listingReference.querySelector('input');
  if (input) input.required = isListing && ['zigbang', 'dabang'].includes(form.elements.sourceChannel.value);
}

function applyQueryPrefill() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source');
  const listing = params.get('listing');
  if (source && form.elements.sourceChannel?.querySelector(`option[value="${CSS.escape(source)}"]`)) {
    form.elements.sourceChannel.value = source;
  }
  if (listing) {
    const listingOption = form.querySelector('input[name="inquiryType"][value="listing"]');
    if (listingOption) listingOption.checked = true;
    form.elements.externalListingRef.value = listing.slice(0, 80);
  }
}

async function submitInquiry(event) {
  event.preventDefault();
  if (form.elements.website?.value) {
    showStatus('접수되었습니다. 확인 후 연락드리겠습니다.', 'success');
    form.reset();
    return;
  }

  const data = new FormData(form);
  let payload;
  try {
    payload = buildInquiryPayload({
      inquiryType: data.get('inquiryType'),
      sourceChannel: data.get('sourceChannel'),
      externalListingRef: data.get('externalListingRef'),
      name: data.get('name'),
      phone: data.get('phone'),
      callbackTime: data.get('callbackTime'),
      message: data.get('message')
    });
  } catch (error) {
    showStatus(error.message || '입력 내용을 확인해 주세요.', 'error');
    form.elements.phone?.focus();
    return;
  }

  setSubmitting(true);
  showStatus('문의 내용을 안전하게 접수하고 있습니다.', 'pending');

  try {
    const result = await createInquiry(payload);
    if (!result?.success || result.persisted !== true) throw new Error('INQUIRY_NOT_PERSISTED');
    const analytics = buildInquiryAnalyticsEvent(payload);
    if (typeof window.gtag === 'function') {
      window.gtag('event', analytics.name, analytics.params);
    }
    form.reset();
    syncListingReference();
    showStatus('접수되었습니다. 확인 후 희망 시간에 전화드리겠습니다.', 'success');
  } catch (error) {
    console.error('[Inquiry] submission failed', error);
    showStatus('접수 중 문제가 생겼습니다. 잠시 후 다시 시도하거나 전화해 주세요.', 'error');
  } finally {
    setSubmitting(false);
  }
}

function setSubmitting(isSubmitting) {
  if (!submitButton) return;
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? '접수 중…' : '문의 남기기';
}

function showStatus(message, state) {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.setAttribute('role', state === 'error' ? 'alert' : 'status');
}
