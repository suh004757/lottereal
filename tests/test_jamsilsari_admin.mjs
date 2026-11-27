import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectListings } from '../public/jamsilsari/js/platformListings.mjs';

const source = new URL('../public/js/adminPlatform.js', import.meta.url);
async function platform() {
  assert.ok(readFileSync(source, 'utf8').includes('recordBatch'));
  return import(source);
}
const one = '10000000-0000-4000-8000-000000000001';
const two = '10000000-0000-4000-8000-000000000002';
const defaults = { tier: 'owner_listed', intake_channel: '전화', listing_scope: 'unknown' };

test('all rows validate before the first append; tenant submissions require consent', async () => {
  const { recordBatch } = await platform();
  const calls = [];
  const rpc = (...args) => calls.push(args);
  await assert.rejects(recordBatch(rpc, [{ listing_id: one }, { listing_id: two, tier: 'tenant_listed' }], defaults), /동의/);
  await assert.rejects(recordBatch(rpc, [{ listing_id: one }, { listing_id: one }], defaults), /중복/);
  await assert.rejects(recordBatch(rpc, [{ listing_id: one }], { ...defaults, intake_channel: '' }), /접촉/);
  assert.deepEqual(calls, []);
});

test('one append per row, overrides win, and partial outcomes remain distinct', async () => {
  const { recordBatch } = await platform();
  const calls = [];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    if (args.listing_id === two) throw new Error('fixture failure');
    return 'verification-id';
  };
  const result = await recordBatch(rpc, [{ listing_id: one }, { listing_id: two, tier: 'site_visit', intake_channel: '방문' }], defaults);
  assert.deepEqual(result, [{ id: one, ok: true }, { id: two, ok: false }]);
  assert.deepEqual(calls, [
    ['admin_record_listing_verification', { listing_id: one, ...defaults, landlord_consent_confirmed: false, note: null, transaction_type: null }],
    ['admin_record_listing_verification', { listing_id: two, ...defaults, tier: 'site_visit', intake_channel: '방문', landlord_consent_confirmed: false, note: null, transaction_type: null }]
  ]);
});

test('request draft excludes private contact and free text; publication is blocked by default', async () => {
  const { requestDraft, createAdminPlatformApi } = await platform();
  const draft = requestDraft({ address_text: '비공개 상세 주소', district: '송파구', transaction_type: '전세', deposit_manwon: 5000, description: 'private note', owner_name: 'private name', owner_phone: 'private phone' });
  assert.deepEqual(draft, { title: '송파구 전세', district: '송파구', transactionType: '전세', price: '', deposit: 5000, monthlyRent: '' });
  const calls = [];
  const api = createAdminPlatformApi({ rpc: (...args) => calls.push(args) }, async () => {});
  await assert.rejects(api.publish(one, draft, defaults), /H6/);
  assert.deepEqual(calls, []);
});

test('admin check precedes RPC and invite URL keeps the token exclusively in the fragment', async () => {
  const { createAdminPlatformApi, inviteLink } = await platform();
  const calls = [];
  const api = createAdminPlatformApi({ rpc: (...args) => calls.push(args) }, async () => { throw new Error('not admin'); });
  await assert.rejects(api.rpc('admin_list_listing_requests', { status_filter: 'new' }), /not admin/);
  assert.deepEqual(calls, []);
  const token = 'a'.repeat(48);
  const link = new URL(inviteLink(token, 'https://example.test/admin/dashboard.html'));
  assert.equal(link.pathname, '/jamsilsari/invite.html');
  assert.equal(link.search, '');
  assert.equal(link.hash, `#${token}`);
  assert.throws(() => inviteLink('bad', link.href));
});

test('isolated fixture sends the M1 publication contract and derives a public tier', async () => {
  const { createAdminPlatformApi } = await platform();
  const rows = [];
  const verifications = [];
  const api = createAdminPlatformApi(null, async () => {}, {
    publishFixture: async (name, args) => {
      assert.equal(name, 'admin_publish_listing_request');
      assert.deepEqual(Object.keys(args).sort(), ['overrides', 'request_id', 'verification']);
      assert.equal(args.request_id, one);
      assert.equal(args.verification.transaction_type, '전세');
      assert.equal(args.overrides.owner_phone, undefined);
      assert.equal(args.overrides.description, undefined);
      rows.push({ id: two, title: args.overrides.title, district: args.overrides.district });
      verifications.push({ listing_id: two, ...args.verification, verified_at: '2026-08-18T09:00:00Z' });
      return two;
    }
  });
  const values = { title: '합성 매물', district: '잠실동', transactionType: '전세', owner_phone: 'private', description: 'private' };
  await assert.rejects(api.publish(one, values, { ...defaults, tier: 'tenant_listed' }), /동의/);
  assert.equal(rows.length, 0);
  assert.equal(await api.publish(one, values, defaults), two);
  const [{ status }] = selectListings(rows, verifications, { now: new Date('2026-08-18T12:00:00Z') });
  assert.equal(status.tier, 'owner_listed');
});
