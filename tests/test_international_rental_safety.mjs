import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERNATIONAL_RENTAL_ISSUES,
  getInternationalRentalSuggestions,
  searchInternationalRentalSafety
} from '../public/js/internationalRentalSafety.mjs';

test('international safety migration is bounded, sourced and free of customer data', () => {
  assert.ok(INTERNATIONAL_RENTAL_ISSUES.length >= 8);
  assert.ok(INTERNATIONAL_RENTAL_ISSUES.length <= 12);
  for (const issue of INTERNATIONAL_RENTAL_ISSUES) {
    assert.match(issue.id, /^[a-z0-9-]+$/);
    assert.ok(issue.title);
    assert.ok(issue.beforeSigning.length >= 1);
    assert.ok(issue.evidenceToKeep.length >= 1);
    assert.ok(issue.firstSteps.length >= 1);
    assert.ok(issue.sources.length >= 1);
    assert.ok(issue.sources.every((source) => source.url.startsWith('https://')));
    assert.match(issue.lastReviewed, /^2026-10-08$/);
  }
  const serialized = JSON.stringify(INTERNATIONAL_RENTAL_ISSUES).toLowerCase();
  for (const forbidden of ['customer@example.invalid', '+99 123 456 789', 'passport-number-example']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('common foreign-renter questions map to a small relevant result set', () => {
  const deposit = searchInternationalRentalSafety('My landlord has not returned my deposit');
  assert.equal(deposit.matches[0].id, 'deposit-return');
  assert.ok(deposit.matches.length <= 3);

  const mold = searchInternationalRentalSafety('There is mold and condensation in the bedroom');
  assert.equal(mold.matches[0].id, 'mold-repairs');

  const reporting = searchInternationalRentalSafety('How do I report my address and get a fixed date?');
  assert.equal(reporting.matches[0].id, 'address-reporting');
  assert.ok(reporting.detectedTopicIds.includes('address-reporting'));

  const translation = searchInternationalRentalSafety('The Korean contract and English translation are different');
  assert.equal(translation.matches[0].id, 'contract-language');
});

test('suggestions are concise and contain no free-form customer data', () => {
  const suggestions = getInternationalRentalSuggestions();
  assert.equal(suggestions.length, 4);
  assert.ok(suggestions.every((item) => item.length <= 80));
});

test('generic requests return an honest empty state', () => {
  for (const query of ['I am in Korea', 'This is a question', 'Can you help me?', 'I need a home']) {
    const result = searchInternationalRentalSafety(query);
    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.detectedTopicIds, []);
  }
});