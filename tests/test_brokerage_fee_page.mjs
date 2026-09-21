import test from 'node:test';
import assert from 'node:assert/strict';

import { formatKoreanAmount, manWonToWon } from '../js/brokerageFeePage.mjs';

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
