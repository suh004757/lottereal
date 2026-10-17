import assert from 'node:assert/strict';
import test from 'node:test';

import { getExternalProfileLinks } from '../public/js/config/externalProfiles.mjs';

test('empty links stay as 준비 중 (no href)', () => {
  const links = getExternalProfileLinks({ zigbang: '', dabang: '' });
  assert.deepEqual(links.map((link) => [link.label, link.href]), [['직방', ''], ['다방', '']]);
});

test('public profile pages are accepted', () => {
  const [zigbang, dabang] = getExternalProfileLinks({
    zigbang: 'https://www.zigbang.com/agent/12345',
    dabang: 'https://www.dabangapp.com/agent/abc'
  });
  assert.equal(zigbang.href, 'https://www.zigbang.com/agent/12345');
  assert.equal(dabang.href, 'https://www.dabangapp.com/agent/abc');
});

test('private back-office or token links never become public buttons', () => {
  const [zigbang] = getExternalProfileLinks({ zigbang: 'https://sp.zigbang.com/inquiry/list?token=abc' });
  assert.equal(zigbang.href, '');
  const [withQuery] = getExternalProfileLinks({ zigbang: 'https://www.zigbang.com/agent/1?token=abc' });
  assert.equal(withQuery.href, '');
  const [insecure] = getExternalProfileLinks({ zigbang: 'http://www.zigbang.com/agent/1' });
  assert.equal(insecure.href, '');
});
