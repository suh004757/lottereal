import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateBrokerageFee } from '../js/brokerageFeeCalculator.mjs';

test('calculates the Seoul housing sale ceiling for a 100 million won transaction', () => {
  const result = calculateBrokerageFee({
    propertyType: 'housing',
    transactionType: 'sale',
    price: 100_000_000,
  });

  assert.equal(result.transactionAmount, 100_000_000);
  assert.equal(result.rate, 0.005);
  assert.equal(result.ceilingFee, 500_000);
  assert.equal(result.cap, 800_000);
  assert.equal(result.monthlyMultiplier, null);
});

test('uses every Seoul housing sale boundary and statutory cap correctly', () => {
  const cases = [
    [49_999_999, 0.006, 250_000, 250_000],
    [50_000_000, 0.005, 800_000, 250_000],
    [199_999_999, 0.005, 800_000, 800_000],
    [200_000_000, 0.004, null, 800_000],
    [900_000_000, 0.005, null, 4_500_000],
    [1_200_000_000, 0.006, null, 7_200_000],
    [1_500_000_000, 0.007, null, 10_500_000],
  ];

  for (const [price, rate, cap, ceilingFee] of cases) {
    const result = calculateBrokerageFee({ propertyType: 'housing', transactionType: 'sale', price });
    assert.equal(result.rate, rate, `rate at ${price}`);
    assert.equal(result.cap, cap, `cap at ${price}`);
    assert.equal(result.ceilingFee, ceilingFee, `fee at ${price}`);
  }
});

test('converts monthly rent with the 100 multiplier and recalculates below 50 million won with 70', () => {
  const ordinary = calculateBrokerageFee({
    propertyType: 'housing', transactionType: 'rent', deposit: 100_000_000, monthlyRent: 1_500_000,
  });
  assert.equal(ordinary.transactionAmount, 250_000_000);
  assert.equal(ordinary.monthlyMultiplier, 100);
  assert.equal(ordinary.rate, 0.003);
  assert.equal(ordinary.ceilingFee, 750_000);

  const lowValue = calculateBrokerageFee({
    propertyType: 'housing', transactionType: 'rent', deposit: 10_000_000, monthlyRent: 300_000,
  });
  assert.equal(lowValue.transactionAmount, 31_000_000);
  assert.equal(lowValue.monthlyMultiplier, 70);
  assert.equal(lowValue.rate, 0.005);
  assert.equal(lowValue.ceilingFee, 155_000);

  const exactThreshold = calculateBrokerageFee({
    propertyType: 'housing', transactionType: 'rent', deposit: 20_000_000, monthlyRent: 300_000,
  });
  assert.equal(exactThreshold.transactionAmount, 50_000_000);
  assert.equal(exactThreshold.monthlyMultiplier, 100);
});

test('uses every Seoul housing rental boundary and statutory cap correctly', () => {
  const cases = [
    [49_999_999, 0.005, 200_000, 200_000],
    [50_000_000, 0.004, 300_000, 200_000],
    [99_999_999, 0.004, 300_000, 300_000],
    [100_000_000, 0.003, null, 300_000],
    [600_000_000, 0.004, null, 2_400_000],
    [1_200_000_000, 0.005, null, 6_000_000],
    [1_500_000_000, 0.006, null, 9_000_000],
  ];
  for (const [deposit, rate, cap, ceilingFee] of cases) {
    const result = calculateBrokerageFee({
      propertyType: 'housing', transactionType: 'rent', deposit, monthlyRent: 0,
    });
    assert.equal(result.rate, rate, `rate at ${deposit}`);
    assert.equal(result.cap, cap, `cap at ${deposit}`);
    assert.equal(result.ceilingFee, ceilingFee, `fee at ${deposit}`);
  }
});

test('applies the officetel and non-housing ceilings from the national rule', () => {
  const officetelSale = calculateBrokerageFee({
    propertyType: 'officetel-standard', transactionType: 'sale', price: 500_000_000,
  });
  assert.equal(officetelSale.rate, 0.005);
  assert.equal(officetelSale.ceilingFee, 2_500_000);

  const officetelRent = calculateBrokerageFee({
    propertyType: 'officetel-standard', transactionType: 'rent', deposit: 100_000_000, monthlyRent: 1_000_000,
  });
  assert.equal(officetelRent.transactionAmount, 200_000_000);
  assert.equal(officetelRent.rate, 0.004);
  assert.equal(officetelRent.ceilingFee, 800_000);

  for (const propertyType of ['officetel-other', 'other']) {
    const result = calculateBrokerageFee({ propertyType, transactionType: 'sale', price: 500_000_000 });
    assert.equal(result.rate, 0.009);
    assert.equal(result.ceilingFee, 4_500_000);
  }
});

test('rejects zero, negative, non-finite, and unsupported inputs', () => {
  const invalidCases = [
    { propertyType: 'housing', transactionType: 'sale', price: 0 },
    { propertyType: 'housing', transactionType: 'sale', price: Number.NaN },
    { propertyType: 'housing', transactionType: 'sale', price: 100_000_000_000_001 },
    { propertyType: 'housing', transactionType: 'rent', deposit: -1, monthlyRent: 0 },
    { propertyType: 'palace', transactionType: 'sale', price: 100_000_000 },
  ];
  for (const input of invalidCases) {
    assert.throws(() => calculateBrokerageFee(input), { name: 'RangeError' });
  }
});
