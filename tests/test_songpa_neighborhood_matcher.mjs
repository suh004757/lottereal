import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { rankNeighborhoods } from '../public/js/songpaNeighborhoodMatcher.mjs';

const config = JSON.parse(fs.readFileSync(
  new URL('../public/Data/songpa-neighborhood-guide.v1.json', import.meta.url),
  'utf8',
));

test('ranks a Jamsil-access solo profile deterministically and limits results from config', () => {
  const input = { purpose: 'solo', priorities: ['transit', 'jamsil', 'amenities'] };
  const first = rankNeighborhoods(input, config);
  const second = rankNeighborhoods(input, config);
  assert.deepEqual(first, second);
  assert.equal(first.length, config.resultLimit);
  assert.equal(first[0].id, 'samjeon');
  assert.ok(first[0].reasons.length >= 2);
  assert.ok(first[0].tradeoffs.length >= 1);
});

test('puts Munjeong first for a business and newer-space profile', () => {
  const results = rankNeighborhoods({
    purpose: 'business',
    priorities: ['business', 'transit', 'newer'],
  }, config);
  assert.equal(results[0].id, 'munjeong');
});

test('rejects unknown purposes, unknown priorities, duplicate priorities, and oversized selections', () => {
  const invalid = [
    { purpose: 'invest', priorities: ['transit'] },
    { purpose: 'solo', priorities: ['future-value'] },
    { purpose: 'solo', priorities: ['transit', 'transit'] },
    { purpose: 'solo', priorities: ['transit', 'jamsil', 'quiet', 'parking'] },
  ];
  for (const input of invalid) {
    assert.throws(() => rankNeighborhoods(input, config), { name: 'RangeError' });
  }
});

test('does not mutate the versioned configuration or expose raw scoring details', () => {
  const before = JSON.stringify(config);
  const results = rankNeighborhoods({ purpose: 'family', priorities: ['quiet', 'parking'] }, config);
  assert.equal(JSON.stringify(config), before);
  for (const result of results) {
    assert.equal('score' in result, false);
    assert.equal('signals' in result, false);
    assert.equal('purposeFit' in result, false);
  }
});
