import assert from 'node:assert/strict';
import {
  buildInquiryPayload,
  buildInquiryAnalyticsEvent,
  normalizePhone
} from '../js/inquiryMvp.js';

const formValues = {
  inquiryType: 'listing',
  sourceChannel: 'zigbang',
  externalListingRef: '12345678',
  name: '홍길동',
  phone: '010-1234-5678',
  callbackTime: 'weekday-evening',
  message: '입주일이 궁금합니다.'
};

assert.equal(normalizePhone(formValues.phone), '01012345678');
assert.throws(() => normalizePhone('02-123'), /연락처/);

const payload = buildInquiryPayload(formValues);
assert.equal(payload.listingId, null);
assert.equal(payload.listingTitle, '직방 매물 12345678');
assert.equal(payload.phone, '01012345678');
assert.equal(payload.metadata.inquiry_type, 'listing');
assert.equal(payload.metadata.source_channel, 'zigbang');
assert.equal(payload.metadata.external_listing_ref, '12345678');
assert.equal(payload.metadata.callback_time, 'weekday-evening');
assert.match(payload.message, /입주일이 궁금합니다/);

const analytics = buildInquiryAnalyticsEvent(payload);
assert.equal(analytics.name, 'listing_inquiry_complete');
assert.deepEqual(analytics.params, {
  inquiry_type: 'listing',
  source_channel: 'zigbang',
  callback_time: 'weekday-evening'
});
const serializedAnalytics = JSON.stringify(analytics);
assert.equal(serializedAnalytics.includes('01012345678'), false);
assert.equal(serializedAnalytics.includes('12345678'), false);
assert.equal(serializedAnalytics.includes('홍길동'), false);
assert.equal(serializedAnalytics.includes('입주일'), false);

const callbackPayload = buildInquiryPayload({
  inquiryType: 'callback',
  sourceChannel: 'website',
  externalListingRef: '',
  name: '',
  phone: '010 2222 3333',
  callbackTime: 'today-afternoon',
  message: ''
});
assert.equal(callbackPayload.listingTitle, '전화 요청');
assert.equal(buildInquiryAnalyticsEvent(callbackPayload).name, 'callback_request_complete');

const consultationPayload = buildInquiryPayload({
  inquiryType: 'consultation',
  sourceChannel: 'other',
  externalListingRef: '',
  name: '김고객',
  phone: '01099998888',
  callbackTime: 'anytime',
  message: '전세 상담'
});
assert.equal(consultationPayload.listingTitle, '일반 상담');
assert.equal(buildInquiryAnalyticsEvent(consultationPayload).name, 'general_inquiry_complete');

console.log('inquiry MVP payload tests passed');
