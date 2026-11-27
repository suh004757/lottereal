import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browseRepository, selectListings, loadDetail, listingPrice, monthlyCosts, mapEnabled} from '../public/jamsilsari/js/platformListings.mjs';
import {safeReturn, syncFavorites} from '../public/jamsilsari/js/platformAuth.mjs';
const id = '00000000-0000-0000-0000-000000000001';
const now = new Date('2026-11-30T00:00Z');
const v = (listing_id, tier, verified_at, more={}) => ({listing_id,tier,verified_at,transaction_type:'매매',...more});
const listing = (id, more={}) => ({id, title:'매물', district:'잠실동', price:17000,...more});
test('latest verification wins, stale sorts last, withdrawn/missing/closed excluded', () => {
  const rows = ['old','new','withdrawn','missing','closed'].map(x => listing(x));
  const checks = [v('old','site_visit','2026-10-30'),v('new','owner_listed','2026-11-29'),v('new','site_visit','2026-11-28'),v('withdrawn','site_visit','2026-11-12'),v('withdrawn','withdrawn','2026-11-30'),v('closed','site_visit','2026-11-25',{closed_at:'2026-11-27'})];
  const active = selectListings(rows,checks,{now});
  assert.deepEqual(active.map(a => a.id),['new','old']);
  assert.equal(active[0].status.tier,'owner_listed');
  assert.deepEqual(selectListings(rows,checks,{now, district:'삼전동'}),[]);
  assert.deepEqual(selectListings(rows,checks,{now, maxPrice:100}),[]);
  assert.deepEqual(selectListings(rows,checks,{now, tier:'site_visit'}).map(a => a.id),['old']);
});
test('detail never requests fields for closed or absent verification; stamp has no details', async () => {
  let reads = 0;
  const fetchListing = async () => { reads++; return listing(id); };
  const closed = v(id,'site_visit','2026-11-29',{closed_at:'2026-11-30'});
  for (const row of [closed, null, v(id,'withdrawn','2026-11-30')]) {
    assert.equal(await loadDetail({fetchVerification:async () => row, fetchListing},id,{now}),null);
  }
  assert.equal((await loadDetail({fetchVerification:async () => closed,fetchListing},id,{now,showCompleted:true})).status.label,'거래완료');
  assert.equal(reads,0);
  assert.equal((await loadDetail({fetchVerification:async () => v(id,'site_visit','2026-11-29'),fetchListing},id,{now})).id,id);
  assert.equal(reads,1);
});
test('price units, unknown costs, map absence', () => {
  assert.equal(listingPrice(listing(id,{transaction_type:'매매'})),'매매 1억 7,000만원');
  const costs = monthlyCosts({transaction_type:'월세',monthly_rent:70,maintenance_fee:0});
  assert.equal(costs.monthly,null);
  assert.equal(costs.fixed,null);
  assert.equal(costs.maintenance,0);
  assert.equal(mapEnabled({}),false);
});
test('missing verification view is empty without any legacy query; permission errors still surface', async () => {
  let error;
  const repo = browseRepository({from(name) {
    assert.equal(name,'pf_public_listing_verifications');
    const read = async () => ({data:null,error});
    return {select:() => ({order:() => ({limit:read}),eq:() => ({maybeSingle:read})})};
  }});
  for (const code of ['PGRST205','42P01']) {
    error = {code};
    assert.deepEqual(await repo.all(),{listings:[],verifications:[]});
    assert.equal(await loadDetail(repo,id,{now}),null);
  }
  error = {code:'42501'};
  await assert.rejects(repo.all(),{code:'42501'});
});

test('login return is confined to platform pages and never reflects callback parameters', () => {
  for (const x of ['//example.org/jamsilsari/','/jamsilsari/../admin','/jamsilsari/%2e%2e/index.html','/jamsilsari/login.html','https://example.org/jamsilsari/me.html','/jamsilsari\\me.html']) assert.equal(safeReturn(x),'/jamsilsari/me.html');
  assert.equal(safeReturn(`/jamsilsari/listing.html?id=${id}&token=ignored`),`/jamsilsari/listing.html?id=${id}`);
});
test('sync preserves retryable local favorites and only clears confirmed rows', async () => {
  const second = '00000000-0000-0000-0000-000000000002';
  const result = await syncFavorites([id,second], async () => [id], async () => false);
  assert.deepEqual(result,{saved:[id],pending:[second]});
});
