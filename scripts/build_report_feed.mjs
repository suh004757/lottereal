#!/usr/bin/env node
// RSS 2.0 feed of the published static reports, for Naver Search Advisor / Google feed
// submission. Built from public/reports/*.html (what is actually live), not from the CMS,
// and dated from the reports themselves so an unchanged set produces a byte-identical file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_NAME = '롯데부동산';
const MAX_ITEMS = 40;

function xml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlText(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function rfc822(dateOnly) {
  const date = new Date(`${dateOnly}T09:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString().replace('GMT', '+0000');
}

export function readReportEntry(html, filename) {
  const title = html.match(/<title>(.*?) \| 롯데부동산<\/title>/s)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const link = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  let published = '';
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(block[1]);
      if (data?.['@type'] === 'Article' && data.datePublished) published = String(data.datePublished).slice(0, 10);
    } catch {
      // A malformed block only costs this field; the page is still listed if the rest is there.
    }
  }
  if (!title || !link || !/^\d{4}-\d{2}-\d{2}$/.test(published)) return null;
  return {
    title: htmlText(title),
    description: htmlText(description || ''),
    link: htmlText(link),
    published,
    slug: path.basename(filename, '.html')
  };
}

export function renderFeed(entries, siteUrl = 'https://lottes.co.kr') {
  const base = String(siteUrl).replace(/\/$/, '');
  const items = [...entries]
    .sort((a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug))
    .slice(0, MAX_ITEMS);
  const lastBuild = items[0] ? rfc822(items[0].published) : '';
  const body = items.map((item) => [
    '    <item>',
    `      <title>${xml(item.title)}</title>`,
    `      <link>${xml(item.link)}</link>`,
    `      <guid isPermaLink="true">${xml(item.link)}</guid>`,
    `      <description>${xml(item.description)}</description>`,
    `      <pubDate>${rfc822(item.published)}</pubDate>`,
    '    </item>'
  ].join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${SITE_NAME} 시장·계약 자료</title>`,
    `    <link>${base}/report.html</link>`,
    `    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>`,
    '    <description>송파·잠실 부동산 계약 사례와 공공 자료 기반 시장 리포트</description>',
    '    <language>ko</language>',
    lastBuild ? `    <lastBuildDate>${lastBuild}</lastBuildDate>` : '',
    body,
    '  </channel>',
    '</rss>',
    ''
  ].filter((line) => line !== '').join('\n');
}

export function buildReportFeed({ reportsDir, output, siteUrl = 'https://lottes.co.kr' }) {
  const entries = fs.readdirSync(reportsDir)
    .filter((filename) => filename.endsWith('.html'))
    .map((filename) => readReportEntry(fs.readFileSync(path.join(reportsDir, filename), 'utf8'), filename))
    .filter(Boolean);
  const feed = renderFeed(entries, siteUrl);
  const current = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
  if (current !== feed) fs.writeFileSync(output, feed, 'utf8');
  return { items: Math.min(entries.length, MAX_ITEMS), changed: current !== feed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildReportFeed({
    reportsDir: path.join(REPO, 'public', 'reports'),
    output: path.join(REPO, 'public', 'rss.xml')
  });
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}
