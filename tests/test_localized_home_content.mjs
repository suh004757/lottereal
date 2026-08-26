import test from 'node:test';
import assert from 'node:assert/strict';
import { filterContentForLanguage } from '../js/localizedHomeContent.mjs';

test('English home keeps only explicitly English reports and feeds', () => {
  const rows = [
    { title: '송파 시장 리포트', metadata: { language: 'ko' } },
    { title: 'Seoul rental guide', metadata: { locale: 'en-US' } },
    { title: '언어 표기 없는 기존 글' },
    { title: 'English feed', language: 'en' }
  ];

  assert.deepEqual(
    filterContentForLanguage(rows, 'en').map((row) => row.title),
    ['Seoul rental guide', 'English feed']
  );
});

test('Korean home preserves the existing full public stream', () => {
  const rows = [
    { title: '한국어 글', metadata: { language: 'ko' } },
    { title: '언어 표기 없는 기존 글' },
    { title: 'English guide', metadata: { language: 'en' } }
  ];

  assert.equal(filterContentForLanguage(rows, 'ko'), rows);
});
