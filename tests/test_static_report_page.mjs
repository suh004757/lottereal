import assert from 'node:assert/strict';
import { isSafeReportSlug, trackStaticReportView } from '../js/staticReportPage.mjs';

assert.equal(isSafeReportSlug('2026-09-26-songpa-safe-check'), true);
assert.equal(isSafeReportSlug('../escape'), false);
assert.equal(isSafeReportSlug(''), false);

const seen = [];
assert.equal(
  await trackStaticReportView('2026-09-26-songpa-safe-check', async (slug) => seen.push(slug)),
  true
);
assert.deepEqual(seen, ['2026-09-26-songpa-safe-check']);
assert.equal(await trackStaticReportView('../escape', async () => seen.push('bad')), false);
assert.deepEqual(seen, ['2026-09-26-songpa-safe-check']);

console.log('static report view tracking tests passed');
