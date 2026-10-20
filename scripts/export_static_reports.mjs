#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readReportEntry, renderFeed } from './build_report_feed.mjs';
import { getReportLandingConfigByKey, reportBreadcrumbSection, selectLandingReports } from '../public/js/config/reportLandingConfig.js';
import { compareReportsByPublication } from '../public/js/utils/reportDates.mjs';

const require = createRequire(import.meta.url);
const { Marked, Renderer } = require('../public/js/vendor/marked-18.0.11.min.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARCHIVE_START = '<!-- STATIC_REPORT_ARCHIVE_START -->';
const ARCHIVE_END = '<!-- STATIC_REPORT_ARCHIVE_END -->';
const LINKS_START = '<!-- REPORT_LINKS_START -->';
const LINKS_END = '<!-- REPORT_LINKS_END -->';
// Pages whose report lists are rendered by JavaScript. Each carries a marked placeholder
// that the exporter fills with plain links (replaced on load).
const LINKED_PAGES = [
  'index.html',
  'disputes.html',
  'songpa-market-report.html',
  'jamsil-market-report.html',
  'gangnam-office-report.html',
];
const COPYRIGHT_YEAR = 2026;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeHttpUrl(value = '') {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeLinkHref(value = '') {
  const raw = String(value).trim();
  try {
    const sameSite = new URL(raw);
    if (sameSite.protocol === 'https:' && sameSite.hostname === 'lottes.co.kr') {
      const absoluteReport = sameSite.pathname === '/report.html'
        ? String(sameSite.searchParams.get('slug') || '')
        : '';
      if (SAFE_SLUG.test(absoluteReport)) return `${absoluteReport}.html`;
      const staticMatch = sameSite.pathname.match(/^\/reports\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/);
      if (staticMatch) return `${staticMatch[1]}.html`;
      return `..${sameSite.pathname}${sameSite.search}${sameSite.hash}`;
    }
  } catch {
    // Relative links continue through the checks below.
  }
  const reportMatch = raw.match(/^report\.html\?slug=([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (reportMatch) return `${reportMatch[1]}.html`;
  const staticReportMatch = raw.match(/^\/?reports\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/);
  if (staticReportMatch) return `${staticReportMatch[1]}.html`;
  if (raw.startsWith('/') && !raw.startsWith('//')) return `..${raw}`;
  if (/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?:#[a-zA-Z0-9_-]+)?$/.test(raw)) return `../${raw}`;
  if (/^#[a-zA-Z0-9_-]+$/.test(raw)) return raw;
  return safeHttpUrl(raw);
}

function markdownRenderer() {
  const renderer = new Renderer();
  renderer.link = function link(token) {
    const href = safeLinkHref(token.href) || '#';
    const label = this.parser.parseInline(token.tokens || []);
    const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    const external = /^https?:\/\//.test(href) ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href="${escapeHtml(href)}"${title}${external}>${label}</a>`;
  };
  renderer.image = function image(token) {
    const src = safeHttpUrl(token.href);
    if (!src) return '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text || '')}" loading="lazy">`;
  };
  renderer.html = function html(token) {
    return escapeHtml(token.text || '');
  };
  return new Marked({ renderer, gfm: true, breaks: false });
}

const markdown = markdownRenderer();

function dateOnly(value) {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isCalendarDate(raw) ? raw : '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return '';
  const [, year, month, day, hour, minute, second, offsetHour = '00', offsetMinute = '00'] = match;
  if (!isCalendarDate(`${year}-${month}-${day}`)
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
      || Number(offsetHour) > 23 || Number(offsetMinute) > 59) return '';
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp));
}

function metadataDate(report, field) {
  const value = report?.metadata?.[field];
  if (value === undefined || value === null || value === '') return '';
  const parsed = dateOnly(value);
  if (!parsed) throw new Error(`invalid metadata.${field} for report ${report?.slug || ''}`);
  return parsed;
}

function publishedDate(report) {
  return metadataDate(report, 'published_at') || dateOnly(report?.created_at);
}

function sourceModifiedDate(report) {
  return metadataDate(report, 'modified_at')
    || dateOnly(report?.updated_at)
    || publishedDate(report);
}

function isCalendarDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() + 1 === month
    && calendar.getUTCDate() === day;
}

function parseRequiredTimestamp(report, field) {
  const raw = report?.[field];
  const match = typeof raw === 'string'
    ? raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/)
    : null;
  if (match) {
    const [, year, month, day, hour, minute, second, offsetHour = '00', offsetMinute = '00'] = match;
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const validCalendar = calendar.getUTCFullYear() === Number(year)
      && calendar.getUTCMonth() + 1 === Number(month)
      && calendar.getUTCDate() === Number(day);
    if (validCalendar && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
        && Number(offsetHour) <= 23 && Number(offsetMinute) <= 59
        && Number.isFinite(Date.parse(raw))) {
      return Date.parse(raw);
    }
  }
  throw new Error(`invalid ${field} for report ${report?.slug || ''}: full ISO timestamp required`);
}

function jsonLd(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function withoutLeadingMarkdownH1(value = '') {
  return String(value).replace(/^\uFEFF?\s*#\s+[^\n]+\n+/, '');
}

function renderEvidence(items = []) {
  const links = items
    .map((item) => {
      const href = safeHttpUrl(item?.url);
      if (!href) return '';
      const checked = item?.checkedAt ? ` · 확인 ${escapeHtml(item.checkedAt)}` : '';
      return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(item?.name || href)}</a>${checked}</li>`;
    })
    .filter(Boolean)
    .join('\n');
  return links || '<li>본문에 표시된 공식 자료를 확인해 주세요.</li>';
}

function publicContentHash(report) {
  const publicFields = {
    title: String(report?.title || '').trim(),
    summary: String(report?.summary || '').trim(),
    published: publishedDate(report),
    body_html: markdown.parse(withoutLeadingMarkdownH1(report?.report_md || '')),
    evidence_html: renderEvidence(report?.evidence_json),
  };
  return createHash('sha256').update(JSON.stringify(publicFields)).digest('hex');
}

function previousExportState(html = '') {
  const contentHash = String(html).match(/<meta name="lottereal:content-hash" content="([a-f0-9]{64})">/)?.[1] || '';
  const modifiedDate = String(html).match(/"dateModified":"(\d{4}-\d{2}-\d{2})"/)?.[1] || '';
  return { contentHash, modifiedDate };
}

function withoutContentHashMeta(html = '') {
  return String(html).replace(/^  <meta name="lottereal:content-hash" content="[a-f0-9]{64}">\n/m, '');
}

function isContractGuidance(report) {
  const contentType = String(report?.metadata?.content_type || '').trim();
  return contentType === 'dispute_case' || contentType.endsWith('_checklist');
}

function reportCategory(report) {
  const contentType = String(report?.metadata?.content_type || '').trim();
  if (contentType === 'dispute_case') return { key: 'dispute', label: '계약·분쟁 사례' };
  if (contentType.endsWith('_checklist')) return { key: 'checklist', label: '계약 체크리스트' };
  if (contentType.endsWith('_guide') || contentType.endsWith('_explainer')) return { key: 'guide', label: '실전 가이드' };
  return { key: 'market', label: '시장 리포트' };
}

// The top-menu section a report belongs to; dispute cases live under the 계약 사례 hub.
function reportSection(report) {
  const section = reportBreadcrumbSection(report?.metadata);
  return { href: section.path, name: section.name };
}

function shareImageName(report) {
  return `report-${reportCategory(report).key}.png`;
}

function renderGlance(report, bodyHtml) {
  const text = bodyHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const minutes = Math.max(1, Math.round(text.length / 500));
  const checks = (bodyHtml.match(/<li[\s>]/g) || []).length;
  const sources = Array.isArray(report?.evidence_json) ? report.evidence_json.length : 0;
  const items = [
    ['유형', reportCategory(report).label],
    ['읽는 시간', `약 ${minutes}분`],
    ['확인 항목', `${checks}개`],
    ['공개 출처', `${sources}건`],
  ];
  return '<ul class="lr-report-glance" aria-label="한눈에 보기">'
    + items.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join('')
    + '</ul>';
}

function renderReportCta(report) {
  if (isContractGuidance(report)) {
    return '<section class="lr-section"><div class="lr-container lr-cta"><div>'
      + '<p class="lr-kicker">계약·관리 상담</p>'
      + '<h2>내 상황에서 먼저 확인할 순서를 정리하세요</h2>'
      + '<p class="lr-lead">계약 형태, 주요 날짜, 확인한 서류를 알려주시면 중개 실무 범위에서 다음 확인 항목을 정리해 드립니다. 법률 판단이 필요한 사안은 전문가 확인이 필요합니다.</p>'
      + '<div class="lr-actions">'
      + '<a class="lr-btn lr-btn--primary" href="../contact.html?intent=consultation#inquiry-options">상황 문의 남기기</a>'
      + '<a class="lr-btn lr-btn--ghost" href="tel:050714025055">전화로 설명하기</a>'
      + '<a class="lr-btn lr-btn--ghost" href="../brokerage-fee-calculator.html">중개보수 계산하기</a>'
      + '</div></div></div></section>';
  }
  return '<section class="lr-section"><div class="lr-container lr-cta"><div>'
    + '<p class="lr-kicker">상담 준비</p>'
    + '<h2>내 조건에 맞는 매물을 함께 확인하세요</h2>'
    + '<p class="lr-lead">예산, 입주 시기, 선호 지역을 알려주시면 방문 전에 확인할 후보를 정리해 드립니다.</p>'
    + '<div class="lr-actions">'
    + '<a class="lr-btn lr-btn--primary" href="tel:050714025055">전화 문의</a>'
    + '<a class="lr-btn lr-btn--ghost" href="../contact.html?intent=consultation#inquiry-options">문의 남기기</a>'
    + '<a class="lr-btn lr-btn--ghost" href="../brokerage-fee-calculator.html">중개보수 계산하기</a>'
    + '</div></div></div></section>';
}

// Server-rendered links between report pages. Crawlers that skip JavaScript (Naver's
// Yeti) otherwise only reach a report through the sitemap. Nearest publication dates in
// the same category first, so every page passes links to different neighbours instead of
// all pointing at the newest posts. Not part of the content hash: a new neighbour must
// not advance an unchanged report's dateModified.
export function selectRelatedReports(report, reports = [], limit = 4) {
  const slug = String(report?.slug || '');
  const category = reportCategory(report).key;
  const day = (value) => Date.parse(`${publishedDate(value)}T00:00:00Z`) || 0;
  const origin = day(report);
  return reports
    .filter((other) => SAFE_SLUG.test(String(other?.slug || '')) && other.slug !== slug
      && String(other?.title || '').trim())
    .map((other) => ({
      other,
      rank: reportCategory(other).key === category ? 0 : 1,
      distance: Math.abs(day(other) - origin),
    }))
    .sort((left, right) => left.rank - right.rank || left.distance - right.distance
      || (left.other.slug < right.other.slug ? -1 : left.other.slug > right.other.slug ? 1 : 0))
    .slice(0, limit)
    .map(({ other }) => other);
}

const NEIGHBORHOODS = JSON.parse(fs.readFileSync(path.join(REPO, 'public', 'Data', 'songpa-neighborhood-guide.v1.json'), 'utf8')).neighborhoods;

const NEIGHBORHOOD_ALIASES = {
  jamsil: ['잠실동', '잠실'],
  samjeon: ['삼전동', '삼전'],
  seokchon: ['석촌동', '석촌'],
  songpa: ['송파동'],
  bangi: ['방이동', '방이'],
  garak: ['가락동', '가락', '가락시장'],
  munjeong: ['문정동', '문정', '문정법조단지', '문정법조타운'],
};

function containsBoundedKoreanTerm(text, term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^가-힣A-Za-z0-9])${escaped}(?=$|[^가-힣A-Za-z0-9])`).test(text);
}

export function neighborhoodsInTitle(title = '', neighborhoods = NEIGHBORHOODS, metadata = {}) {
  const text = String(title);
  const metadataAliases = [
    metadata?.legal_dong,
    metadata?.legalDong,
    metadata?.neighborhood,
    ...(Array.isArray(metadata?.neighborhoods) ? metadata.neighborhoods : []),
    ...(Array.isArray(metadata?.neighborhood_aliases) ? metadata.neighborhood_aliases : []),
    ...(Array.isArray(metadata?.neighborhoodAliases) ? metadata.neighborhoodAliases : []),
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());

  return neighborhoods.filter((area) => {
    const aliases = NEIGHBORHOOD_ALIASES[area.id] || [area.name];
    const titleTerms = area.id === 'songpa' ? [area.name] : [area.name, String(area.name).replace(/동$/, '')];
    const titleMatch = titleTerms.some((term) => containsBoundedKoreanTerm(text, term));
    const metadataMatch = metadataAliases.some((value) => aliases.some((alias) => (
      value === String(alias).toLowerCase() || value === String(area.id).toLowerCase()
    )));
    return titleMatch || metadataMatch;
  });
}

function renderAreaGuide(report) {
  const areas = neighborhoodsInTitle(report?.title, NEIGHBORHOODS, report?.metadata);
  if (!areas.length) return '';
  const links = areas.map((area) => (
    `<a class="lr-link" href="../songpa-neighborhood-guide.html#area-${escapeHtml(area.id)}">${escapeHtml(area.name)} 생활권 안내</a>`
  )).join(' ');
  return '<section class="lr-section lr-report-area-guide"><div class="lr-container">'
    + `<p class="lr-kicker">이 글의 동네</p><p>${links}</p>`
    + '</div></section>';
}

function renderRelatedReports(report, related = []) {
  if (!related.length) return '';
  const items = related.map((other) => (
    `<li><a href="${other.slug}.html">${escapeHtml(String(other.title).trim())}</a></li>`
  )).join('');
  const section = reportSection(report);
  return '<section class="lr-section lr-related-reports" aria-labelledby="related-reports-title"><div class="lr-container">'
    + '<h2 id="related-reports-title">함께 보면 좋은 자료</h2>'
    + `<ul class="lr-report-archive-all__list">${items}</ul>`
    + `<p><a href="../${section.href}">전체 자료 보기</a></p>`
    + '</div></section>';
}

// Daily posts open with the publication day ("2026년 10월 17일 …"). Searchers type the
// question, not the day, and result titles get cut off, so the browser/search title leads
// with the question. Month/week prefixes stay: there the period is the subject.
export function searchTitle(title = '') {
  const value = String(title).trim();
  const withoutDay = value.replace(/^\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s+/, '').trim();
  return withoutDay || value;
}

export function renderStaticReport(report, siteUrl = 'https://lottes.co.kr', options = {}) {
  const slug = String(report?.slug || '');
  if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
  const base = String(siteUrl).replace(/\/$/, '');
  const canonical = `${base}/reports/${slug}.html`;
  const title = String(report?.title || '').trim();
  const summary = String(report?.summary || '').trim();
  if (!title || !summary) throw new Error(`missing title or summary: ${slug}`);
  const published = publishedDate(report);
  const contentHash = options.contentHash || publicContentHash(report);
  const modified = dateOnly(options.modifiedDate) || sourceModifiedDate(report);
  const body = markdown.parse(withoutLeadingMarkdownH1(report?.report_md || ''));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: summary,
    url: canonical,
    datePublished: published || undefined,
    dateModified: modified || undefined,
    inLanguage: 'ko-KR',
    author: { '@type': 'Organization', name: '롯데부동산', url: `${base}/` },
    publisher: { '@type': 'Organization', name: '롯데부동산', url: `${base}/` },
  };
  for (const key of Object.keys(schema)) if (schema[key] === undefined) delete schema[key];
  const section = reportSection(report);
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '롯데부동산', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: section.name, item: `${base}/${section.href}` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; script-src 'self' https://www.googletagmanager.com https://wcs.pstatic.net; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://wcs.naver.com; form-action 'self'; upgrade-insecure-requests">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>${escapeHtml(searchTitle(title))} | 롯데부동산</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <meta name="lottereal:content-hash" content="${contentHash}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="롯데부동산 시장·계약 자료" href="${base}/rss.xml">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${escapeHtml(searchTitle(title))} | 롯데부동산">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${base}/img/og/${shareImageName(report)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <script type="application/ld+json">${jsonLd(breadcrumb)}</script>
  <script src="../js/privacyAnalytics.js"></script>
  <link rel="icon" href="../img/core-img/favicon.ico">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../css/mobile.css">
  <link rel="stylesheet" href="../css/insights.css">
</head>
<body data-report-slug="${escapeHtml(slug)}">
  <div class="lr-read-progress" aria-hidden="true"><span></span></div>
  <header class="lr-header"><div class="lr-container">
    <div class="lr-brand"><a href="../">롯데부동산</a></div>
    <button class="lr-hamburger" aria-label="메뉴" aria-expanded="false">☰</button>
    <nav class="lr-nav" aria-label="주요 메뉴">
      <a href="../corporate-buildings.html">기업 사옥</a><a href="../listings.html">매물 찾기</a>
      <a href="../report.html"${section.href === 'report.html' ? ' class="active"' : ''}>시장·정책</a><a href="../disputes.html"${section.href === 'disputes.html' ? ' class="active"' : ''}>계약 사례</a>
      <a href="../knowledge.html">자료 찾기</a><a href="../contact.html" class="lr-nav-cta">문의·방문</a>
    </nav>
  </div></header>
  <main>
    <section class="lr-report-header"><div class="lr-container">
      <div class="lr-report-meta"><span class="lr-badge lr-badge--info">정보 제공 목적</span><span class="lr-badge lr-badge--data">공개 자료 확인</span></div>
      <h1>${escapeHtml(title)}</h1><p class="lr-report-subtitle">${escapeHtml(summary)}</p>
      ${renderGlance(report, body)}
      <div class="lr-report-info"><div class="lr-report-info-item"><span class="lr-label">발행·수정</span><span class="lr-value">발행 ${escapeHtml(published || '확인 필요')} · 수정 ${escapeHtml(modified || '확인 필요')}</span></div></div>
      <div class="lr-report-intent-actions"><a class="lr-btn lr-btn--primary" href="tel:050714025055">전화로 바로 물어보기</a><a class="lr-btn lr-btn--ghost" href="../listings.html">매물 보기</a><a class="lr-btn lr-btn--ghost" href="../contact.html">위치·방문 안내</a></div>
    </div></section>
    <section class="lr-section"><div class="lr-container"><article class="lr-report-body">${body}</article></div></section>
    <section class="lr-section lr-section--muted"><div class="lr-container"><div class="lr-disclaimer"><strong>자료 출처</strong><ul>${renderEvidence(report?.evidence_json)}</ul><p>공개 자료를 바탕으로 정리한 정보 제공용 자료이며, 특정 거래나 수익을 보장하지 않습니다. 실제 계약 전에는 최신 서류와 현장을 다시 확인해 주세요.</p></div></div></section>
    ${renderAreaGuide(report)}
    ${renderRelatedReports(report, options.related || [])}
    ${renderReportCta(report)}
  </main>
  <footer class="lr-footer"><div class="lr-container lr-footer__content"><div><p class="lr-kicker">롯데부동산</p><p class="lr-text">서울시 송파구 백제고분로27길 27 1층</p><p class="lr-text">문의전화: 0507-1402-5055 | 중개사무소등록번호 11710-2018-00141</p></div><div class="lr-footer__links"><a href="../privacy.html">개인정보처리방침</a><a href="../EN.html">ENGLISH</a></div></div><p class="lr-footer__copy">© ${COPYRIGHT_YEAR} 롯데부동산. All rights reserved.</p></footer>
  <div class="lr-mobile-actionbar" aria-label="빠른 상담 메뉴">
    <a href="tel:050714025055"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg></span><strong>전화상담</strong></a>
    <a href="../contact.html#inquiry-options"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4z"/></svg></span><strong>문의하기</strong></a>
    <a href="../listings.html"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M3 11l9-7 9 7M5 10v10h14V10"/></svg></span><strong>매물보기</strong></a>
    <a href="../contact.html"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg></span><strong>오시는 길</strong></a>
  </div>
  <script src="../js/analyticsEvents.js"></script><script src="../js/mobileNav.js"></script><script src="../js/phoneHandoff.js"></script><script type="module" src="../js/staticReportPage.mjs"></script>
</body>
</html>\n`;
}

function resolveModifiedDate(report, existingHtml, siteUrl) {
  const sourceModified = sourceModifiedDate(report);
  if (!existingHtml) return sourceModified;
  const previous = previousExportState(existingHtml);
  const published = publishedDate(report);
  if (!isCalendarDate(previous.modifiedDate) || previous.modifiedDate < published) return sourceModified;
  const contentHash = publicContentHash(report);
  if (previous.contentHash === contentHash) return previous.modifiedDate;
  if (!previous.contentHash) {
    const candidate = renderStaticReport(report, siteUrl, {
      contentHash,
      modifiedDate: previous.modifiedDate,
    });
    if (withoutContentHashMeta(candidate) === existingHtml) return previous.modifiedDate;
  }
  return sourceModified;
}

function updateSitemap(sitemapText, reports, siteUrl, modifiedDates = new Map()) {
  const base = String(siteUrl).replace(/\/$/, '');
  let next = sitemapText.replace(/\s*<url>\s*<loc>https:\/\/lottes\.co\.kr\/(?:report\.html\?slug=[^<]+|reports\/[^<]+\.html)<\/loc>[\s\S]*?<\/url>/g, '');
  const entries = reports.map((report) => {
    const slug = String(report.slug || '');
    if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
    const modified = modifiedDates.get(slug) || sourceModifiedDate(report);
    return `  <url>\n    <loc>${base}/reports/${slug}.html</loc>\n    <lastmod>${modified}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`;
  }).join('\n');
  if (!next.includes('</urlset>')) throw new Error('invalid sitemap: missing </urlset>');
  return next.replace(/\s*<\/urlset>\s*$/, `\n${entries}\n</urlset>\n`);
}

function updateSitemapPageLastmod(sitemapText, loc, modified) {
  const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<url>\\s*<loc>${escaped}</loc>)([\\s\\S]*?</url>)`);
  const match = sitemapText.match(pattern);
  if (!match) throw new Error(`sitemap URL missing for rewritten page: ${loc}`);
  const tail = /<lastmod>[^<]*<\/lastmod>/.test(match[2])
    ? match[2].replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${modified}</lastmod>`)
    : `\n    <lastmod>${modified}</lastmod>${match[2]}`;
  return sitemapText.replace(pattern, `${match[1]}${tail}`);
}

function renderSlugManifest(reports) {
  const slugs = reports.map((report) => String(report.slug || '')).sort();
  for (const slug of slugs) if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
  return `// Generated by scripts/export_static_reports.mjs. Do not edit.\nexport const EXPORTED_REPORT_SLUGS = new Set(${JSON.stringify(slugs, null, 2)});\n`;
}

function newestFirst(reports) {
  return [...reports].sort(compareReportsByPublication);
}

// Crawlers that skip JavaScript (Naver's Yeti) see these links where the page script
// later renders its cards. A hub page (data-report-landing) lists the same reports its
// script selects; other pages list the newest. Returns null when the page has no markers.
function linkedPageReports(pageText, reports, limit = 6) {
  const landingKey = pageText.match(/data-report-landing="([a-z-]+)"/)?.[1] || '';
  const config = landingKey ? getReportLandingConfigByKey(landingKey) : null;
  return {
    config,
    selected: config
      ? selectLandingReports(reports, config).slice(0, landingKey === 'dispute-cases' ? undefined : limit)
      : newestFirst(reports).slice(0, limit),
  };
}

function updateLinkedReportPage(pageText, reports, limit = 6) {
  const start = pageText.indexOf(LINKS_START);
  const end = pageText.indexOf(LINKS_END);
  if (start < 0 || end < 0 || end <= start) return null;
  const { config, selected } = linkedPageReports(pageText, reports, limit);
  const items = selected.map((report) => (
    `<li><a href="reports/${report.slug}.html">${escapeHtml(String(report.title || '').trim())}</a></li>`
  )).join('');
  const block = selected.length
    ? `<div data-server-report-fallback><p class="lr-kicker">${config ? '관련 자료' : '최근 자료'}</p>`
      + `<ul class="lr-report-archive-all__list">${items}</ul>`
      + '<p><a href="report.html">전체 자료 보기</a></p></div>'
    : '<div class="lr-report-hub__empty" data-server-report-fallback>선택 기준에 맞는 관련 리포트가 아직 없습니다.</div>';
  return pageText.slice(0, start) + LINKS_START + block + pageText.slice(end);
}

function updateReportArchive(reportPageText, reports) {
  const start = reportPageText.indexOf(ARCHIVE_START);
  const end = reportPageText.indexOf(ARCHIVE_END);
  if (start < 0 || end < 0 || end <= start
      || reportPageText.lastIndexOf(ARCHIVE_START) !== start
      || reportPageText.lastIndexOf(ARCHIVE_END) !== end) {
    throw new Error('invalid report archive markers');
  }
  const ordered = [...reports].sort(compareReportsByPublication);
  const items = ordered.map((report) => (
    `                        <li><a href="reports/${report.slug}.html">${escapeHtml(String(report.title || '').trim())}</a></li>`
  )).join('\n');
  const archive = `${ARCHIVE_START}\n`
    + '                <div class="lr-report-archive-all" id="report-archive-all-static">\n'
    + `                    <p class="lr-kicker">전체 리포트 (${ordered.length}건)</p>\n`
    + '                    <ul class="lr-report-archive-all__list">\n'
    + `${items}\n`
    + '                    </ul>\n'
    + '                </div>\n'
    + `                ${ARCHIVE_END}`;
  return reportPageText.slice(0, start) + archive + reportPageText.slice(end + ARCHIVE_END.length);
}

function loadEnv(file = '/opt/data/.env') {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return { ...values, ...process.env };
}

async function fetchPublishedReports(envFile) {
  const env = loadEnv(envFile);
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL and browser-safe key are required');
  const fields = 'slug,title,summary,report_md,evidence_json,metadata,created_at,updated_at,status';
  const pageSize = 1000;
  const reports = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${base}/rest/v1/market_reports?select=${fields}&status=eq.published&order=created_at.desc,slug.asc&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`published report fetch failed: HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('published report fetch returned a non-array response');
    reports.push(...page);
    if (page.length < pageSize) return reports;
  }
}

function parseArgs(argv) {
  const args = { outputDir: path.join(REPO, 'public', 'reports'), sitemap: path.join(REPO, 'public', 'Sitemap.xml'), reportPage: path.join(REPO, 'public', 'report.html'), slugManifest: null, siteUrl: 'https://lottes.co.kr', env: '/opt/data/.env', allowShrink: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index];
    else if (value === '--output-dir') args.outputDir = argv[++index];
    else if (value === '--sitemap') args.sitemap = argv[++index];
    else if (value === '--report-page') args.reportPage = argv[++index];
    else if (value === '--slug-manifest') args.slugManifest = argv[++index];
    else if (value === '--site-url') args.siteUrl = argv[++index];
    else if (value === '--env') args.env = argv[++index];
    else if (value === '--allow-shrink') args.allowShrink = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!args.slugManifest) args.slugManifest = path.join(path.dirname(args.reportPage), 'js', 'generated', 'reportSlugs.mjs');
  return args;
}

function removePath(target) {
  fs.rmSync(target, { force: true, recursive: true });
}

function syncFile(target) {
  const descriptor = fs.openSync(target, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function syncDirectory(target) {
  let descriptor;
  try {
    descriptor = fs.openSync(target, 'r');
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF', 'EPERM'].includes(error.code)) throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function sha256File(target) {
  return fs.existsSync(target)
    ? createHash('sha256').update(fs.readFileSync(target)).digest('hex')
    : null;
}

function writeDurableJson(target, value) {
  const temporary = path.join(
    path.dirname(target),
    `.journal-${process.pid}-${Date.now()}-${createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8)}.tmp`,
  );
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
  syncFile(temporary);
  fs.renameSync(temporary, target);
  syncDirectory(path.dirname(target));
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function processStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    if (close < 0) return null;
    return stat.slice(close + 2).trim().split(/\s+/)[19] || null;
  } catch {
    return null;
  }
}

function validMutexOwner(owner) {
  return Boolean(owner)
    && owner.version === 1
    && typeof owner.token === 'string' && owner.token.length > 0
    && Number.isSafeInteger(owner.pid) && owner.pid > 0
    && (typeof owner.processStart === 'string' || owner.processStart === null)
    && typeof owner.createdAt === 'string' && Number.isFinite(Date.parse(owner.createdAt));
}

function readMutexOwner(root) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8'));
    return validMutexOwner(owner) ? owner : null;
  } catch {
    return null;
  }
}

function mutexOwnerIsLive(owner) {
  if (!validMutexOwner(owner) || !processIsAlive(owner.pid)) return false;
  const actualStart = processStart(owner.pid);
  // Only declare PID reuse when both identities are available and differ.
  // A transiently unavailable /proc value must never permit takeover of a
  // process whose PID is still alive.
  if (actualStart === null || owner.processStart === null) return true;
  return owner.processStart === actualStart;
}

function candidateIdentityFromName(target, mutexRoot) {
  const prefix = `${path.basename(mutexRoot)}.candidate-`;
  const name = path.basename(target);
  if (!name.startsWith(prefix)) return null;
  const match = name.slice(prefix.length).match(/^(\d+)-([^-]+)-/);
  return match ? {
    pid: Number(match[1]),
    processStart: match[2] === 'unknown' ? null : match[2],
  } : null;
}

function ownerlessCandidateMayBeLive(target, mutexRoot) {
  const identity = candidateIdentityFromName(target, mutexRoot);
  if (!identity || !processIsAlive(identity.pid)) return false;
  const actualStart = processStart(identity.pid);
  return actualStart === null || identity.processStart === null || actualStart === identity.processStart;
}

function verifyMutexOwnership(mutexRoot, token) {
  const owner = readMutexOwner(mutexRoot);
  if (!owner || owner.token !== token) {
    throw new Error(`publication mutex ownership token mismatch: ${mutexRoot}`);
  }
}

function cleanupMutexDebris(mutexRoot, token) {
  verifyMutexOwnership(mutexRoot, token);
  const parent = path.dirname(mutexRoot);
  const base = path.basename(mutexRoot);
  for (const name of fs.readdirSync(parent)) {
    if (!name.startsWith(`${base}.candidate-`)
        && !name.startsWith(`${base}.stale-`)
        && !name.startsWith(`${base}.release-`)) continue;
    const target = path.join(parent, name);
    const owner = readMutexOwner(target);
    if (owner ? mutexOwnerIsLive(owner) : ownerlessCandidateMayBeLive(target, mutexRoot)) continue;
    removePath(target);
  }
  syncDirectory(parent);
}

function makeMutexCandidate(mutexRoot) {
  const token = randomUUID();
  const start = processStart(process.pid);
  const candidate = `${mutexRoot}.candidate-${process.pid}-${start || 'unknown'}-${token}`;
  const owner = {
    version: 1,
    token,
    pid: process.pid,
    processStart: start,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(candidate);
  const ownerPath = path.join(candidate, 'owner.json');
  fs.writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`, { encoding: 'utf8', flag: 'wx' });
  syncFile(ownerPath);
  syncDirectory(candidate);
  syncDirectory(path.dirname(mutexRoot));
  return { token, candidate };
}

function acquirePublicationMutex(mutexRoot) {
  const parent = path.dirname(mutexRoot);
  const { token, candidate } = makeMutexCandidate(mutexRoot);
  let staleClaim = null;
  try {
    for (;;) {
      if (!fs.existsSync(mutexRoot)) {
        try {
          fs.renameSync(candidate, mutexRoot);
          syncDirectory(parent);
          cleanupMutexDebris(mutexRoot, token);
          return token;
        } catch (error) {
          if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
        }
      }

      let observed;
      try {
        observed = fs.lstatSync(mutexRoot);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const incumbent = readMutexOwner(mutexRoot);
      if (incumbent && mutexOwnerIsLive(incumbent)) {
        throw new Error(`publication mutex owner process is alive (${incumbent.pid}): ${mutexRoot}`);
      }

      staleClaim = `${mutexRoot}.stale-${process.pid}-${token}-${randomUUID()}`;
      try {
        fs.renameSync(mutexRoot, staleClaim);
        syncDirectory(parent);
      } catch (error) {
        staleClaim = null;
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const claimed = fs.lstatSync(staleClaim);
      const claimedOwner = readMutexOwner(staleClaim);
      const sameObservedMutex = incumbent
        ? claimedOwner?.token === incumbent.token
        : !claimedOwner && claimed.dev === observed.dev && claimed.ino === observed.ino;
      if (!sameObservedMutex) {
        // The well-known path changed between inspection and rename. Put the
        // displaced live owner back rather than treating it as the stale one.
        if (!fs.existsSync(mutexRoot)) {
          fs.renameSync(staleClaim, mutexRoot);
          syncDirectory(parent);
          staleClaim = null;
          continue;
        }
        staleClaim = null; // foreign live claim: preserve it for later recovery
        throw new Error(`publication mutex changed during stale takeover: ${mutexRoot}`);
      }
    }
  } catch (error) {
    if (fs.existsSync(candidate)) removePath(candidate);
    if (staleClaim && fs.existsSync(staleClaim)) removePath(staleClaim);
    syncDirectory(parent);
    throw error;
  }
}

function releasePublicationMutex(mutexRoot, token) {
  verifyMutexOwnership(mutexRoot, token);
  const parent = path.dirname(mutexRoot);
  const releaseClaim = `${mutexRoot}.release-${token}`;
  fs.renameSync(mutexRoot, releaseClaim);
  syncDirectory(parent);
  const owner = readMutexOwner(releaseClaim);
  if (!owner || owner.token !== token) {
    if (!fs.existsSync(mutexRoot)) {
      fs.renameSync(releaseClaim, mutexRoot);
      syncDirectory(parent);
    }
    throw new Error(`publication mutex ownership token mismatch: ${releaseClaim}`);
  }
  removePath(releaseClaim);
  syncDirectory(parent);
}

function linkedPagePaths(args) {
  return LINKED_PAGES.map((name) => path.resolve(path.dirname(args.reportPage), name));
}

function allowedTarget(target, args) {
  const resolved = path.resolve(target);
  if (resolved === path.resolve(args.sitemap) || resolved === path.resolve(args.reportPage)
      || resolved === path.resolve(args.slugManifest)
      || linkedPagePaths(args).includes(resolved)
      || resolved === path.resolve(path.dirname(args.sitemap), 'rss.xml')) return true;
  return path.dirname(resolved) === path.resolve(args.outputDir)
    && resolved.endsWith('.html')
    && SAFE_SLUG.test(path.basename(resolved, '.html'));
}

function childPath(root, relative, prefix) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('invalid transaction relative path');
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)
      || (prefix && !relative.replaceAll('\\', '/').startsWith(`${prefix}/`))) {
    throw new Error('transaction path escapes recovery root');
  }
  return resolved;
}

function validateJournal(journal, lockRoot, args) {
  if (!journal || journal.version !== 1
      || !['prepared', 'committing', 'committed'].includes(journal.phase)
      || !Number.isInteger(journal.progress) || journal.progress < 0
      || !Array.isArray(journal.operations) || journal.progress > journal.operations.length) {
    throw new Error('invalid publication journal');
  }
  const seen = new Set();
  for (const operation of journal.operations) {
    if (!operation || !['replace', 'delete'].includes(operation.kind)
        || !allowedTarget(operation.target, args) || seen.has(path.resolve(operation.target))
        || !/^[a-f0-9]{64}$/.test(operation.originalHash || '') && operation.originalHash !== null
        || !/^[a-f0-9]{64}$/.test(operation.nextHash || '') && operation.nextHash !== null) {
      throw new Error('invalid publication journal operation');
    }
    seen.add(path.resolve(operation.target));
    if (operation.kind === 'replace') childPath(lockRoot, operation.staged, 'staged');
    if (operation.originalHash) childPath(lockRoot, operation.backup, 'backups');
    if ((operation.kind === 'replace') !== Boolean(operation.nextHash)
        || Boolean(operation.originalHash) !== Boolean(operation.backup)) {
      throw new Error('invalid publication journal hashes');
    }
  }
  return journal;
}

function cleanupLock(lockRoot) {
  removePath(lockRoot);
  syncDirectory(path.dirname(lockRoot));
}

function recoverTransaction(lockRoot, journal, args) {
  validateJournal(journal, lockRoot, args);
  const errors = [];
  if (journal.phase === 'committed') {
    for (const operation of journal.operations) {
      const current = sha256File(operation.target);
      const expected = operation.kind === 'replace' ? operation.nextHash : null;
      if (current !== expected) errors.push(`committed transaction conflict at ${operation.target}`);
    }
  } else {
    for (let index = journal.operations.length - 1; index >= 0; index -= 1) {
      const operation = journal.operations[index];
      const current = sha256File(operation.target);
      if (operation.originalHash === null) {
        if (current === operation.nextHash) {
          try {
            fs.rmSync(operation.target, { force: true });
            syncDirectory(path.dirname(operation.target));
          } catch (error) {
            errors.push(`cannot remove installed target ${operation.target}: ${error.message}`);
          }
        } else if (current !== null) {
          errors.push(`rollback conflict at ${operation.target}: current content matches neither original nor transaction`);
        }
        continue;
      }
      if (current === operation.originalHash) continue;
      if (current !== operation.nextHash && current !== null) {
        errors.push(`rollback conflict at ${operation.target}: current content matches neither original nor installed hash`);
        continue;
      }
      try {
        const backup = childPath(lockRoot, operation.backup, 'backups');
        if (sha256File(backup) !== operation.originalHash) throw new Error('backup hash mismatch');
        const temporary = path.join(lockRoot, `restore-${index}-${process.pid}`);
        fs.copyFileSync(backup, temporary, fs.constants.COPYFILE_EXCL);
        syncFile(temporary);
        fs.renameSync(temporary, operation.target);
        syncDirectory(path.dirname(operation.target));
      } catch (error) {
        errors.push(`cannot restore backup for ${operation.target}: ${error.message}`);
      }
    }
  }
  if (errors.length) {
    throw new Error(`rollback failed: ${errors.join('; ')}; preserved recovery root: ${lockRoot}`);
  }
  cleanupLock(lockRoot);
}

function initializeTransactionRoot(lockRoot, args, mutexRoot, token) {
  verifyMutexOwnership(mutexRoot, token);
  if (fs.existsSync(lockRoot)) {
    const journalPath = path.join(lockRoot, 'journal.json');
    if (fs.existsSync(journalPath)) {
      let journal;
      try { journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')); } catch (error) {
        throw new Error(`invalid publication journal; preserved recovery root: ${lockRoot}: ${error.message}`);
      }
      recoverTransaction(lockRoot, journal, args);
    } else {
      cleanupLock(lockRoot);
    }
  }
  verifyMutexOwnership(mutexRoot, token);
  fs.mkdirSync(lockRoot);
  fs.mkdirSync(path.join(lockRoot, 'staged'));
  fs.mkdirSync(path.join(lockRoot, 'backups'));
  syncDirectory(lockRoot);
  syncDirectory(path.dirname(lockRoot));
}

function prepareTransaction(lockRoot, specifications) {
  const operations = [];
  for (let index = 0; index < specifications.length; index += 1) {
    const specification = specifications[index];
    const target = path.resolve(specification.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.statSync(path.dirname(target)).dev !== fs.statSync(lockRoot).dev) {
      throw new Error(`transaction target is not on lock filesystem: ${target}`);
    }
    const originalHash = sha256File(target);
    let backup = null;
    if (originalHash) {
      backup = `backups/${index}`;
      const backupPath = childPath(lockRoot, backup, 'backups');
      fs.copyFileSync(target, backupPath, fs.constants.COPYFILE_EXCL);
      syncFile(backupPath);
      if (sha256File(backupPath) !== originalHash || sha256File(target) !== originalHash) {
        throw new Error(`publication target changed while preparing backup: ${target}`);
      }
    }
    let staged = null;
    let nextHash = null;
    if (specification.kind === 'replace') {
      staged = `staged/${index}`;
      const stagedPath = childPath(lockRoot, staged, 'staged');
      fs.writeFileSync(stagedPath, specification.content, 'utf8');
      syncFile(stagedPath);
      nextHash = sha256File(stagedPath);
    }
    operations.push({ target, kind: specification.kind, staged, backup, originalHash, nextHash });
  }
  syncDirectory(path.join(lockRoot, 'staged'));
  syncDirectory(path.join(lockRoot, 'backups'));
  const journal = { version: 1, phase: 'prepared', progress: 0, operations };
  writeDurableJson(path.join(lockRoot, 'journal.json'), journal);
  return journal;
}

function publishTransaction(lockRoot, journal, args, mutexRoot, token) {
  const journalPath = path.join(lockRoot, 'journal.json');
  verifyMutexOwnership(mutexRoot, token);
  journal.phase = 'committing';
  writeDurableJson(journalPath, journal);
  try {
    for (let index = 0; index < journal.operations.length; index += 1) {
      verifyMutexOwnership(mutexRoot, token);
      journal.progress = index;
      writeDurableJson(journalPath, journal);
      const operation = journal.operations[index];
      const currentHash = sha256File(operation.target);
      if (currentHash !== operation.originalHash) {
        throw new Error(`publication target changed before commit: ${operation.target}`);
      }
      if (operation.kind === 'replace') {
        fs.renameSync(childPath(lockRoot, operation.staged, 'staged'), operation.target);
      } else {
        fs.rmSync(operation.target, { force: true });
      }
      syncDirectory(path.dirname(operation.target));
      journal.progress = index + 1;
      writeDurableJson(journalPath, journal);
    }
    journal.phase = 'committed';
    writeDurableJson(journalPath, journal);
    recoverTransaction(lockRoot, journal, args);
  } catch (error) {
    try {
      verifyMutexOwnership(mutexRoot, token);
    } catch {
      throw new Error(`${error.message}; publication mutex ownership lost; preserved recovery root: ${lockRoot}`);
    }
    try {
      const durable = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      recoverTransaction(lockRoot, durable, args);
    } catch (recoveryError) {
      throw new Error(`${error.message}; ${recoveryError.message}`);
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const publicationLock = path.join(
    path.dirname(args.reportPage),
    `.${path.basename(args.reportPage)}.publish.lock`,
  );
  const publicationMutex = path.join(
    path.dirname(args.reportPage),
    `.${path.basename(args.reportPage)}.publish.mutex`,
  );
  const mutexToken = acquirePublicationMutex(publicationMutex);
  let reports;
  try {
    initializeTransactionRoot(publicationLock, args, publicationMutex, mutexToken);
    reports = args.input
      ? JSON.parse(fs.readFileSync(args.input, 'utf8'))
      : await fetchPublishedReports(args.env);
    if (!Array.isArray(reports)) throw new Error('report input must be an array');
    for (const report of reports) {
      const created = parseRequiredTimestamp(report, 'created_at');
      const updated = parseRequiredTimestamp(report, 'updated_at');
      if (updated < created) throw new Error(`updated_at precedes created_at for report ${report?.slug || ''}`);
      const published = publishedDate(report);
      const modified = sourceModifiedDate(report);
      if (modified < published) {
        throw new Error(`dateModified precedes datePublished after Asia/Seoul normalization for report ${report?.slug || ''}`);
      }
    }
    const existing = fs.existsSync(args.outputDir)
      ? fs.readdirSync(args.outputDir).filter((filename) => filename.endsWith('.html'))
      : [];
    const expected = new Set();
    const rendered = new Map();
    const modifiedDates = new Map();
    for (const report of reports) {
      if (!SAFE_SLUG.test(String(report?.slug || ''))) throw new Error(`unsafe report slug: ${report?.slug || ''}`);
      const filename = `${report.slug}.html`;
      if (expected.has(filename)) throw new Error(`duplicate report slug: ${report.slug}`);
      expected.add(filename);
      const outputPath = path.join(args.outputDir, filename);
      const existingHtml = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
      const contentHash = publicContentHash(report);
      const modifiedDate = resolveModifiedDate(report, existingHtml, args.siteUrl);
      modifiedDates.set(report.slug, modifiedDate);
      const related = selectRelatedReports(report, reports);
      rendered.set(filename, renderStaticReport(report, args.siteUrl, { contentHash, modifiedDate, related }));
    }
    const missing = existing.filter((filename) => !expected.has(filename));
    if ((reports.length === 0 || missing.length > 0) && !args.allowShrink) {
      const detail = missing.length ? `: ${missing.join(', ')}` : '';
      throw new Error(`refusing to remove published report snapshots without --allow-shrink${detail}`);
    }
    const sitemap = fs.readFileSync(args.sitemap, 'utf8');
    let nextSitemap = updateSitemap(sitemap, reports, args.siteUrl, modifiedDates);
    const reportPage = fs.readFileSync(args.reportPage, 'utf8');
    const nextReportPage = updateReportArchive(reportPage, reports);
    const specifications = [];
    for (const [filename, html] of rendered) {
      specifications.push({ kind: 'replace', target: path.join(args.outputDir, filename), content: html });
    }
    for (const filename of missing) {
      specifications.push({ kind: 'delete', target: path.join(args.outputDir, filename) });
    }
    const linkedSpecifications = [];
    for (const linkedPage of linkedPagePaths(args)) {
      if (!fs.existsSync(linkedPage)) continue;
      const pageText = fs.readFileSync(linkedPage, 'utf8');
      const nextPage = updateLinkedReportPage(pageText, reports);
      if (nextPage === null) continue;
      const { selected } = linkedPageReports(pageText, reports);
      if (nextPage !== pageText) {
        linkedSpecifications.push({ kind: 'replace', target: linkedPage, content: nextPage });
      }
      const linkedModified = selected
        .map((report) => modifiedDates.get(report.slug) || sourceModifiedDate(report))
        .sort()
        .at(-1);
      if (linkedModified) {
        const pageName = path.basename(linkedPage);
        const loc = `${String(args.siteUrl).replace(/\/$/, '')}/${pageName === 'index.html' ? '' : pageName}`;
        nextSitemap = updateSitemapPageLastmod(nextSitemap, loc, linkedModified);
      }
    }
    specifications.push({ kind: 'replace', target: args.sitemap, content: nextSitemap });
    specifications.push({ kind: 'replace', target: args.reportPage, content: nextReportPage });
    specifications.push({ kind: 'replace', target: args.slugManifest, content: renderSlugManifest(reports) });
    specifications.push(...linkedSpecifications);
    const feedEntries = [...rendered.entries()]
      .map(([filename, html]) => readReportEntry(html, filename))
      .filter(Boolean);
    specifications.push({
      kind: 'replace',
      target: path.join(path.dirname(args.sitemap), 'rss.xml'),
      content: renderFeed(feedEntries, args.siteUrl),
    });
    verifyMutexOwnership(publicationMutex, mutexToken);
    const journal = prepareTransaction(publicationLock, specifications);
    publishTransaction(publicationLock, journal, args, publicationMutex, mutexToken);
  } catch (error) {
    if (fs.existsSync(publicationLock) && !fs.existsSync(path.join(publicationLock, 'journal.json'))) {
      try {
        verifyMutexOwnership(publicationMutex, mutexToken);
        cleanupLock(publicationLock);
      } catch (cleanupError) {
        throw new Error(`${error.message}; staging cleanup failed: ${cleanupError.message}`);
      }
    }
    throw error;
  } finally {
    releasePublicationMutex(publicationMutex, mutexToken);
  }
  process.stdout.write(JSON.stringify({
    ok: true, reports: reports.length, outputDir: args.outputDir,
    feedItems: Math.min(reports.length, 40),
  }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
