import assert from 'node:assert/strict';
import { buildZigbangInquiryTarget } from '../js/zigbangInquiryRedirect.mjs';

const token = '123e4567-e89b-12d3-a456-426614174000';
assert.equal(
  buildZigbangInquiryTarget(`#token=${token}`),
  `https://sp.zigbang.com/inquiry/list?token=${token}`
);
for (const unsafe of [
  '',
  '#token=not-a-uuid',
  `#token=${token}&next=https://evil.test`,
  `#TOKEN=${token}`,
  `#token=${token.toUpperCase()}`,
  `?token=${token}`
]) {
  assert.equal(buildZigbangInquiryTarget(unsafe), null);
}
console.log('zigbang inquiry redirect tests passed');
