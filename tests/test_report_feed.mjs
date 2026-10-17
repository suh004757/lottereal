import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildReportFeed, readReportEntry, renderFeed } from '../scripts/build_report_feed.mjs';
import { searchTitle } from '../scripts/export_static_reports.mjs';

function page({ title, slug, published, description = '요약 & 설명' }) {
  const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: published };
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
