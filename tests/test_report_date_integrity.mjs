import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareReportsByPublication,
  formatReportDateMeta,
  getPublicationDate,
  getRevisionDate
} from '../js/utils/reportDates.mjs';

const oldEdited = {
  id: 1,
  created_at: '2026-06-01T09:00:00Z',
  updated_at: '2026-08-27T09:00:00Z'
};
const newUntouched = {
  id: 2,
  created_at: '2026-08-20T09:00:00Z',
  updated_at: '2026-08-20T09:01:00Z'
};

test('publication ordering ignores a newer edit timestamp', () => {
  const sorted = [oldEdited, newUntouched].sort(compareReportsByPublication);
  assert.deepEqual(sorted.map((report) => report.id), [2, 1]);
});

test('publication date is stable and revision date requires a real edit gap', () => {
  assert.equal(getPublicationDate(oldEdited).toISOString(), '2026-06-01T09:00:00.000Z');
  assert.equal(getRevisionDate(oldEdited).toISOString(), '2026-08-27T09:00:00.000Z');
  assert.equal(getRevisionDate(newUntouched), null);
});

test('Korean metadata labels publication and material revision separately', () => {
  const text = formatReportDateMeta(oldEdited, { locale: 'ko-KR' });
  assert.match(text, /^발행 /);
  assert.match(text, /수정됨/);
  assert.ok(text.indexOf('2026') < text.indexOf('수정됨'));
});

test('English metadata uses published and updated labels', () => {
  const text = formatReportDateMeta(oldEdited, { locale: 'en-US' });
  assert.match(text, /^Published /);
  assert.match(text, /Updated /);
});

test('invalid dates fall back safely without throwing', () => {
  assert.equal(getPublicationDate({ created_at: 'bad', updated_at: 'also-bad' }), null);
  assert.equal(formatReportDateMeta({ created_at: 'bad' }), '');
});
