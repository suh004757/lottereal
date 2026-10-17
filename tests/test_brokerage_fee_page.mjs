import test from 'node:test';
import assert from 'node:assert/strict';

import { bandPosition, formatBandBoundary, formatKoreanAmount, manWonToWon } from '../public/js/brokerageFeePage.mjs';
import { housingFeeBands } from '../public/js/brokerageFeeCalculator.mjs';

test('converts ten-thousand-won inputs to won without ambiguity', () => {
  assert.equal(manWonToWon('12345'), 123_450_000);
  assert.equal(manWonToWon(0), 0);
  assert.throws(() => manWonToWon('-1'), { name: 'RangeError' });
  assert.throws(() => manWonToWon('1.5'), { name: 'RangeError' });
});

test('formats entered amounts in Korean 억 and 만 units', () => {
  assert.equal(formatKoreanAmount(123_450_000), '1억 2,345만원');
  assert.equal(formatKoreanAmount(300_000), '30만원');
  assert.equal(formatKoreanAmount(0), '금액을 입력해 주세요.');
});

test('places an amount inside the matching housing fee band', () => {
  const sale = housingFeeBands('sale');
  assert.deepEqual(bandPosition(sale, 300_000_000), { index: 2, offset: 1 / 7 });
  assert.equal(bandPosition(sale, 2_000_000_000).index, sale.length - 1);
  assert.equal(bandPosition(sale, 1).offset, 0.04);
  assert.equal(housingFeeBands('other'), null);
});

test('labels band boundaries in 천만 and 억 units', () => {
  assert.equal(formatBandBoundary(50_000_000), '5천만');
  assert.equal(formatBandBoundary(900_000_000), '9억');
  assert.equal(formatBandBoundary(1_200_000_000), '12억');
});
