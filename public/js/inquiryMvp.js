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

const EN_TYPE_LABELS = Object.freeze({
  callback: 'Call request',
  listing: 'Property inquiry',
  consultation: 'General inquiry'
});

const EN_SOURCE_LABELS = Object.freeze({
  website: 'Lotte Real Estate website',
  zigbang: 'Zigbang',
  dabang: 'Dabang',
  naver: 'Naver or another online listing',
  walkin: 'Office visit',
  other: 'Other'
});

const EN_CALLBACK_LABELS = Object.freeze({
  anytime: 'Any time',
  'today-morning': 'This morning',
  'today-afternoon': 'This afternoon',
  'weekday-evening': 'Weekday evening',
  tomorrow: 'Tomorrow'
});

const EVENT_BY_TYPE = Object.freeze({
  callback: 'callback_request_complete',
  listing: 'listing_inquiry_complete',
  consultation: 'general_inquiry_complete'
});

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function normalizeInquiryIntent(value) {
  const candidate = String(value || '').trim();
  return Object.hasOwn(TYPE_LABELS, candidate) ? candidate : '';
}

export function normalizePhone(value, { international = false } = {}) {
  const rawValue = String(value || '').trim();
  let digits = rawValue.replace(/\D/g, '');
  if (international && (digits.startsWith('00') || (!digits.startsWith('0') && !digits.startsWith('82')))) {
    throw new Error('Please enter a Korean phone number.');
  }
  if (international && digits.startsWith('82')) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length < 9 || digits.length > 11) {
    throw new Error(international ? 'Please enter a Korean phone number.' : '연락처를 확인해 주세요.');
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

export function buildInquiryPayload(values = {}, { locale = 'ko' } = {}) {
  const isEnglish = locale === 'en';
  const typeLabels = isEnglish ? EN_TYPE_LABELS : TYPE_LABELS;
  const sourceLabels = isEnglish ? EN_SOURCE_LABELS : SOURCE_LABELS;
  const callbackLabels = isEnglish ? EN_CALLBACK_LABELS : CALLBACK_LABELS;
  const inquiryType = TYPE_LABELS[values.inquiryType] ? values.inquiryType : 'consultation';
  const sourceChannel = SOURCE_LABELS[values.sourceChannel] ? values.sourceChannel : 'other';
  const callbackTime = CALLBACK_LABELS[values.callbackTime] ? values.callbackTime : 'anytime';
  const externalListingRef = cleanText(values.externalListingRef, 80);
  const name = cleanText(values.name, 80);
  const phone = normalizePhone(values.phone, { international: isEnglish });
  const message = cleanText(values.message, 1000);

  const typeLabel = typeLabels[inquiryType];
  const sourceLabel = sourceLabels[sourceChannel];
  const callbackLabel = callbackLabels[callbackTime];
  const listingTitle = inquiryType === 'listing' && externalListingRef
    ? (isEnglish ? `${sourceLabel} listing ${externalListingRef}` : `${sourceLabel} 매물 ${externalListingRef}`)
    : typeLabel;

  const messageParts = isEnglish
    ? [
        `Inquiry type: ${typeLabel}`,
        `Source: ${sourceLabel}`,
        externalListingRef ? `External listing reference: ${externalListingRef}` : '',
        `Preferred contact time: ${callbackLabel}`,
        message ? `Inquiry details: ${message}` : ''
      ].filter(Boolean)
    : [
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
      privacy_consent: values.privacyConsent === true,
      locale: isEnglish ? 'en' : 'ko',
      entry_surface: isEnglish ? 'international-rental-widget' : 'korean-guided-inquiry'
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
