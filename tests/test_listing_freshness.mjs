import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getListingFreshness,
  getListingFreshnessCopy,
  getSafeListingDescription
} from '../js/utils/listingFreshness.mjs';

const NOW = new Date('2026-08-28T00:00:00Z');

test('a recently verified listing keeps its current copy', () => {
  const listing = {
    created_at: '2026-01-01T00:00:00Z',
    metadata: { last_verified_at: '2026-08-20T00:00:00Z' },
    description: '즉시 입주 가능'
  };
  const freshness = getListingFreshness(listing, { now: NOW });
  assert.equal(freshness.needsReview, false);
  assert.equal(freshness.source, 'last_verified_at');
  assert.equal(getSafeListingDescription(listing, freshness, 'ko'), '즉시 입주 가능');
});

test('an old listing is treated as unverified and current availability claims are suppressed', () => {
  const listing = {
    created_at: '2025-12-20T00:00:00Z',
    updated_at: '2026-08-27T00:00:00Z',
    description: '즉시 입주 가능하며 빠른 입주 희망자에게 추천'
  };
  const freshness = getListingFreshness(listing, { now: NOW });
  const copy = getListingFreshnessCopy(freshness, 'ko');
  const safeDescription = getSafeListingDescription(listing, freshness, 'ko');

  assert.equal(freshness.needsReview, true);
  assert.equal(freshness.source, 'created_at');
  assert.equal(copy.label, '거래 가능 여부 확인 필요');
  assert.match(safeDescription, /현재 거래 가능한 매물로 확인된 상태가 아닙니다/);
  assert.doesNotMatch(safeDescription, /즉시 입주|추천/);
});

test('missing or invalid verification dates fail closed', () => {
  const freshness = getListingFreshness({ created_at: 'not-a-date' }, { now: NOW });
  assert.equal(freshness.needsReview, true);
  assert.equal(freshness.ageDays, null);
  assert.equal(getListingFreshnessCopy(freshness, 'en').label, 'Availability needs confirmation');
});
