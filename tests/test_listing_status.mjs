import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listingStatus, SHOW_COMPLETED} from '../public/jamsilsari/js/listingStatus.mjs';
const now = new Date('2026-11-30T03:00Z');
const row = {tier:'owner_listed', listing_scope:'unknown', verified_at:'2026-11-01T03:00Z'};
test('29 and 30 days verified; 31 needs review, measured from verification', () => {
  for (const [day, expected] of [[29,'확인됨'],[30,'확인됨'],[31,'재확인 필요']]) {
    const verified_at = new Date(+now - day * 86400000).toISOString();
    assert.equal(listingStatus({...row, verified_at}, {now}).label, expected);
  }
});
test('only explicit shared and exclusive labels; only visits imply an inspection', () => {
  assert.equal(listingStatus(row, {now}).scopeLabel, '');
  assert.match(listingStatus(row, {now}).notice, /방문 전/);
  assert.equal(listingStatus({...row, listing_scope:'shared'}, {now}).scopeLabel, '중복 게재');
  assert.equal(listingStatus({...row, listing_scope:'exclusive'}, {now}).scopeLabel, '잠실살이 단독');
  assert.doesNotMatch(listingStatus(row, {now}).explanation, /직접 확인/);
  assert.match(listingStatus({...row, tier:'site_visit'}, {now}).explanation, /직접 확인/);
  assert.equal(listingStatus({...row, tier:'withdrawn'}, {now}), null);
  assert.equal(listingStatus(null, {now}), null);
});
test('completed is off by default, optional stamp expires after day 60', () => {
  assert.equal(SHOW_COMPLETED, false);
  assert.equal(listingStatus({...row, closed_at:now}, {now}), null);
  for (const days of [60,61]) {
    const closed_at = new Date(+now - days * 86400000);
    assert.equal(listingStatus({...row, closed_at}, {now, showCompleted:true})?.label, days === 60 ? '거래완료' : undefined);
  }
});
