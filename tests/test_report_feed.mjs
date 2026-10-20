import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildReportFeed, readReportEntry, renderFeed } from '../scripts/build_report_feed.mjs';
import { searchTitle } from '../scripts/export_static_reports.mjs';

function page({ title, slug, published, modified = published, description = '요약 & 설명' }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    datePublished: published,
    dateModified: modified
  };
  return [
    `<title>${title} | 롯데부동산</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="https://lottes.co.kr/reports/${slug}.html">`,
    `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
  ].join('\n');
}

test('search title leads with the question and keeps month or week periods', () => {
  assert.equal(searchTitle('2026년 10월 17일 잠실 아파트 주차, 계약 전에 무엇을 확인할까요?'), '잠실 아파트 주차, 계약 전에 무엇을 확인할까요?');
  assert.equal(searchTitle('2026년 3월 둘째 주 부동산 시장'), '2026년 3월 둘째 주 부동산 시장');
  assert.equal(searchTitle('2026년 10월 17일'), '2026년 10월 17일');
});

test('feed lists newest reports first with escaped text and RFC 822 dates', () => {
  const older = readReportEntry(page({ title: '전입신고 순서', slug: 'a-old', published: '2026-09-01' }), 'a-old.html');
  const newer = readReportEntry(page({ title: '주차 &amp; 관리비', slug: 'b-new', published: '2026-10-17' }), 'b-new.html');
  const xml = renderFeed([older, newer]);
  assert.ok(xml.indexOf('b-new') < xml.indexOf('a-old'));
  assert.match(xml, /<title>주차 &amp; 관리비<\/title>/);
  assert.match(xml, /<pubDate>Sat, 17 Oct 2026 00:00:00 \+0000<\/pubDate>/);
  assert.match(xml, /<lastBuildDate>Sat, 17 Oct 2026 00:00:00 \+0000<\/lastBuildDate>/);
});

test('material revisions use dateModified for inclusion, order, item date, and lastBuildDate', () => {
  const routine = Array.from({ length: 40 }, (_, index) => readReportEntry(page({
    title: `새 글 ${String(index).padStart(2, '0')}`,
    slug: `new-${String(index).padStart(2, '0')}`,
    published: '2026-10-18'
  }), `new-${String(index).padStart(2, '0')}.html`));
  const revised = readReportEntry(page({
    title: '수정된 옛 보고서',
    slug: 'old-revised',
    published: '2026-03-08',
    modified: '2026-10-19'
  }), 'old-revised.html');

  const xml = renderFeed([...routine.reverse(), revised]);

  assert.equal((xml.match(/<item>/g) || []).length, 40);
  assert.ok(xml.indexOf('old-revised') < xml.indexOf('new-00'));
  assert.match(xml, /<lastBuildDate>Mon, 19 Oct 2026 00:00:00 \+0000<\/lastBuildDate>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/lottes\.co\.kr\/reports\/old-revised\.html<\/guid>[\s\S]*?<pubDate>Mon, 19 Oct 2026 00:00:00 \+0000<\/pubDate>/);
  assert.ok(!xml.includes('/reports/new-39.html'));
});

test('neighbor-link-only HTML changes do not become feed revisions', () => {
  const original = page({ title: '기존 글', slug: 'stable', published: '2026-09-01', modified: '2026-10-12' });
  const withDifferentNeighbors = `${original}\n<section class="lr-related-reports">새 이웃 링크</section>`;
  const before = readReportEntry(original, 'stable.html');
  const after = readReportEntry(withDifferentNeighbors, 'stable.html');

  assert.deepEqual(after, before);
  assert.equal(renderFeed([after]), renderFeed([before]));
  assert.match(renderFeed([after]), /<pubDate>Mon, 12 Oct 2026 00:00:00 \+0000<\/pubDate>/);
});

test('pages without a canonical or publication date are left out', () => {
  assert.equal(readReportEntry('<title>제목 | 롯데부동산</title>', 'x.html'), null);
});

test('rebuilding an unchanged report set leaves the feed untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-'));
  const reports = path.join(dir, 'reports');
  fs.mkdirSync(reports);
  fs.writeFileSync(path.join(reports, 'a.html'), page({ title: '제목', slug: 'a', published: '2026-10-01' }));
  const output = path.join(dir, 'rss.xml');
  assert.equal(buildReportFeed({ reportsDir: reports, output }).changed, true);
  assert.equal(buildReportFeed({ reportsDir: reports, output }).changed, false);
});

test('the committed feed matches the published report pages', () => {
  const root = path.resolve(import.meta.dirname, '..', 'public');
  const committed = fs.readFileSync(path.join(root, 'rss.xml'), 'utf8');
  const entries = fs.readdirSync(path.join(root, 'reports'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => readReportEntry(fs.readFileSync(path.join(root, 'reports', name), 'utf8'), name))
    .filter(Boolean);
  assert.equal(committed, renderFeed(entries));
});
