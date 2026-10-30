import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMonthGrid,
  formatAvailability,
  isDayBlocked,
  nextAvailableDate,
  seoulToday,
  toDayNumber
} from '../public/js/utils/shortStayAvailability.mjs';

const LEASE = { starts_on: '2026-10-30', ends_on: '2026-11-05' };

test('the day after the last leased day is the next move-in date', () => {
  assert.equal(nextAvailableDate([LEASE], '2026-10-30'), '2026-11-06');
  assert.equal(nextAvailableDate([LEASE], '2026-11-05'), '2026-11-06');
  assert.equal(nextAvailableDate([LEASE], '2026-11-06'), '2026-11-06');
  assert.equal(nextAvailableDate([LEASE], '2026-10-29'), '2026-10-29');
});

test('back-to-back and overlapping leases are skipped in one pass, in any input order', () => {
  const periods = [
    { starts_on: '2026-11-06', ends_on: '2026-11-12' },
    { starts_on: '2026-11-01', ends_on: '2026-11-03' },
    LEASE
  ];
  assert.equal(nextAvailableDate(periods, '2026-10-31'), '2026-11-13');
});

test('malformed or reversed ranges never block a day', () => {
  const periods = [{ starts_on: '2026-11-10', ends_on: '2026-11-01' }, { starts_on: 'soon', ends_on: null }];
  assert.equal(nextAvailableDate(periods, '2026-11-05'), '2026-11-05');
  assert.equal(isDayBlocked(toDayNumber('2026-11-05'), periods), false);
});

test('month grid marks leased, past and today cells and pads whole weeks', () => {
  const grid = buildMonthGrid(2026, 10, [LEASE], '2026-11-03');
  const cells = grid.weeks.flat().filter(Boolean);
  assert.equal(cells.length, 30);
  assert.ok(grid.weeks.every((week) => week.length === 7));
  const byDate = Object.fromEntries(cells.map((cell) => [cell.date, cell]));
  assert.equal(byDate['2026-11-05'].blocked, true);
  assert.equal(byDate['2026-11-06'].blocked, false);
  assert.equal(byDate['2026-11-02'].past, true);
  assert.equal(byDate['2026-11-03'].today, true);
  // 2026-11-01 is a Sunday, so the month starts in the first column.
  assert.equal(grid.weeks[0][0].date, '2026-11-01');
});

test('copy says move-in is immediate once the date is today or earlier', () => {
  assert.equal(formatAvailability('2026-11-06', '2026-11-06', 'ko'), '즉시입주');
  assert.equal(formatAvailability('2026-11-06', '2026-10-30', 'ko'), '2026년 11월 6일부터 입주 가능');
  assert.equal(formatAvailability('2026-11-06', '2026-10-30', 'ko', 'short'), '11월 6일부터 입주 가능');
  assert.equal(formatAvailability('2026-11-06', '2026-10-30', 'en'), 'Available for move-in from November 6, 2026');
  assert.equal(formatAvailability('2026-11-06', '2026-11-07', 'en', 'badge'), 'Available now');
  assert.equal(formatAvailability('2026-11-06', '2026-10-30', 'ja', 'inline'), '2026年11月6日から入居可');
});

test('today is taken in Seoul time, not the runtime time zone', () => {
  assert.equal(seoulToday(new Date('2026-11-05T15:30:00Z')), '2026-11-06');
  assert.equal(seoulToday(new Date('2026-11-05T14:59:00Z')), '2026-11-05');
});
