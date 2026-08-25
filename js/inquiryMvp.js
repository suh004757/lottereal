const TYPE_LABELS = Object.freeze({
  callback: '전화 요청',
  listing: '매물 문의',
  consultation: '일반 상담'
});

const SOURCE_LABELS = Object.freeze({
  website: '롯데부동산 사이트',
  zigbang: '직방',
  dabang: '다방',
  naver: '네이버',
  walkin: '방문·현장',
  other: '기타'
});

const CALLBACK_LABELS = Object.freeze({
  anytime: '시간 무관',
  'today-morning': '오늘 오전',
  'today-afternoon': '오늘 오후',
  'weekday-evening': '평일 저녁',
  'tomorrow': '내일'
});

const EVENT_BY_TYPE = Object.freeze({
  callback: 'callback_request_complete',
  listing: 'listing_inquiry_complete',
  consultation: 'general_inquiry_complete'
});

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 11) {
    throw new Error('연락처를 확인해 주세요.');
  }
  return digits;
}

export function inquiryValuesFromFormData(data) {
  return {
    inquiryType: data.get('inquiryType'),
    sourceChannel: data.get('sourceChannel'),
    externalListingRef: data.get('externalListingRef'),
    name: data.get('name'),
    phone: data.get('phone'),
    callbackTime: data.get('callbackTime'),
    message: data.get('message'),
    privacyConsent: data.has('privacyConsent')
  };
}

export function buildInquiryPayload(values = {}) {
  const inquiryType = TYPE_LABELS[values.inquiryType] ? values.inquiryType : 'consultation';
  const sourceChannel = SOURCE_LABELS[values.sourceChannel] ? values.sourceChannel : 'other';
  const callbackTime = CALLBACK_LABELS[values.callbackTime] ? values.callbackTime : 'anytime';
  const externalListingRef = cleanText(values.externalListingRef, 80);
  const name = cleanText(values.name, 80);
  const phone = normalizePhone(values.phone);
  const message = cleanText(values.message, 1000);

  const typeLabel = TYPE_LABELS[inquiryType];
  const sourceLabel = SOURCE_LABELS[sourceChannel];
  const callbackLabel = CALLBACK_LABELS[callbackTime];
  const listingTitle = inquiryType === 'listing' && externalListingRef
    ? `${sourceLabel} 매물 ${externalListingRef}`
    : typeLabel;

  const messageParts = [
    `문의 유형: ${typeLabel}`,
    `유입 경로: ${sourceLabel}`,
    externalListingRef ? `외부 매물번호: ${externalListingRef}` : '',
    `희망 연락시간: ${callbackLabel}`,
    message ? `문의 내용: ${message}` : ''
  ].filter(Boolean);

  return {
    listingId: null,
    listingTitle,
    name,
    phone,
    email: '',
    message: messageParts.join('\n'),
    metadata: {
      source: 'public-inquiry-mvp',
      inquiry_type: inquiryType,
      source_channel: sourceChannel,
      external_listing_ref: externalListingRef || null,
      callback_time: callbackTime,
      privacy_consent: values.privacyConsent === true
    }
  };
}

export function buildInquiryAnalyticsEvent(payload) {
  const metadata = payload?.metadata || {};
  return {
    name: EVENT_BY_TYPE[metadata.inquiry_type] || 'general_inquiry_complete',
    params: {
      inquiry_type: metadata.inquiry_type || 'consultation',
      source_channel: metadata.source_channel || 'other',
      callback_time: metadata.callback_time || 'anytime'
    }
  };
}
