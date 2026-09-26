#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Marked, Renderer } = require('../js/vendor/marked-18.0.11.min.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
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

export function renderStaticReport(report, siteUrl = 'https://lottes.co.kr') {
  const slug = String(report?.slug || '');
  if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
  const base = String(siteUrl).replace(/\/$/, '');
  const canonical = `${base}/reports/${slug}.html`;
  const title = String(report?.title || '').trim();
  const summary = String(report?.summary || '').trim();
  if (!title || !summary) throw new Error(`missing title or summary: ${slug}`);
  const published = dateOnly(report?.created_at);
  const modified = dateOnly(report?.updated_at) || published;
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

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; script-src 'self' https://www.googletagmanager.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co https://www.google-analytics.com https://region1.google-analytics.com; form-action 'self'; upgrade-insecure-requests">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>${escapeHtml(title)} | 롯데부동산</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${escapeHtml(title)} | 롯데부동산">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${base}/img/bg-img/lotte_street_view.png">
  <script type="application/ld+json">${jsonLd(schema)}</script>
  <script src="../js/privacyAnalytics.js"></script>
  <link rel="icon" href="../img/core-img/favicon.ico">
  <link rel="stylesheet" href="../style.css">
  <link rel="stylesheet" href="../css/mobile.css">
  <link rel="stylesheet" href="../css/insights.css">
</head>
<body data-report-slug="${escapeHtml(slug)}">
  <header class="lr-header"><div class="lr-container">
    <div class="lr-brand"><a href="../">롯데부동산</a></div>
    <button class="lr-hamburger" aria-label="메뉴" aria-expanded="false">☰</button>
    <nav class="lr-nav" aria-label="주요 메뉴">
      <a href="../corporate-buildings.html">기업 사옥</a><a href="../listings.html">매물 찾기</a>
      <a href="../report.html" class="active">시장·정책</a><a href="../disputes.html">계약 사례</a>
      <a href="../knowledge.html">자료 찾기</a><a href="../contact.html" class="lr-nav-cta">문의·방문</a>
    </nav>
  </div></header>
  <main>
    <section class="lr-report-header"><div class="lr-container">
      <div class="lr-report-meta"><span class="lr-badge lr-badge--info">정보 제공 목적</span><span class="lr-badge lr-badge--data">공개 자료 확인</span></div>
      <h1>${escapeHtml(title)}</h1><p class="lr-report-subtitle">${escapeHtml(summary)}</p>
      <div class="lr-report-info"><div class="lr-report-info-item"><span class="lr-label">발행·수정</span><span class="lr-value">발행 ${escapeHtml(published || '확인 필요')} · 수정 ${escapeHtml(modified || '확인 필요')}</span></div></div>
      <div class="lr-report-intent-actions"><a class="lr-btn lr-btn--primary" href="tel:050714025055">전화로 바로 물어보기</a><a class="lr-btn lr-btn--ghost" href="../listings.html">매물 보기</a><a class="lr-btn lr-btn--ghost" href="../contact.html">위치·방문 안내</a></div>
    </div></section>
    <section class="lr-section"><div class="lr-container"><article class="lr-report-body">${body}</article></div></section>
    <section class="lr-section lr-section--muted"><div class="lr-container"><div class="lr-disclaimer"><strong>자료 출처</strong><ul>${renderEvidence(report?.evidence_json)}</ul><p>공개 자료를 바탕으로 정리한 정보 제공용 자료이며, 특정 거래나 수익을 보장하지 않습니다. 실제 계약 전에는 최신 서류와 현장을 다시 확인해 주세요.</p></div></div></section>
    <section class="lr-section"><div class="lr-container lr-cta"><div><p class="lr-kicker">상담 준비</p><h2>내 조건에 맞는 매물을 함께 확인하세요</h2><p class="lr-lead">예산, 입주 시기, 선호 지역을 알려주시면 방문 전에 확인할 후보를 정리해 드립니다.</p><div class="lr-actions"><a class="lr-btn lr-btn--primary" href="tel:050714025055">전화 문의</a><a class="lr-btn lr-btn--ghost" href="../contact.html#inquiry-options">문의 남기기</a></div></div></div></section>
  </main>
  <footer class="lr-footer"><div class="lr-container lr-footer__content"><div><p class="lr-kicker">롯데부동산</p><p class="lr-text">서울시 송파구 백제고분로27길 27 1층</p><p class="lr-text">문의전화: 0507-1402-5055 | 중개사무소등록번호 11710-2018-00141</p></div><div class="lr-footer__links"><a href="../privacy.html">개인정보처리방침</a><a href="../EN.html">ENGLISH</a></div></div><p class="lr-footer__copy">© ${new Date().getFullYear()} 롯데부동산. All rights reserved.</p></footer>
  <script src="../js/analyticsEvents.js"></script><script src="../js/mobileNav.js"></script><script type="module" src="../js/staticReportPage.mjs"></script>
</body>
</html>\n`;
}

function updateSitemap(sitemapText, reports, siteUrl) {
  const base = String(siteUrl).replace(/\/$/, '');
  let next = sitemapText.replace(/\s*<url>\s*<loc>https:\/\/lottes\.co\.kr\/(?:report\.html\?slug=[^<]+|reports\/[^<]+\.html)<\/loc>[\s\S]*?<\/url>/g, '');
  const entries = reports.map((report) => {
    const slug = String(report.slug || '');
    if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
    const modified = dateOnly(report.updated_at) || dateOnly(report.created_at);
    return `  <url>\n    <loc>${base}/reports/${slug}.html</loc>\n    <lastmod>${modified}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`;
  }).join('\n');
  if (!next.includes('</urlset>')) throw new Error('invalid sitemap: missing </urlset>');
  return next.replace(/\s*<\/urlset>\s*$/, `\n${entries}\n</urlset>\n`);
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
  const url = `${base}/rest/v1/market_reports?select=${fields}&status=eq.published&order=created_at.desc&limit=1000`;
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`published report fetch failed: HTTP ${response.status}`);
  return response.json();
}

function parseArgs(argv) {
  const args = { outputDir: path.join(REPO, 'reports'), sitemap: path.join(REPO, 'Sitemap.xml'), siteUrl: 'https://lottes.co.kr', env: '/opt/data/.env' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index];
    else if (value === '--output-dir') args.outputDir = argv[++index];
    else if (value === '--sitemap') args.sitemap = argv[++index];
    else if (value === '--site-url') args.siteUrl = argv[++index];
    else if (value === '--env') args.env = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = args.input
    ? JSON.parse(fs.readFileSync(args.input, 'utf8'))
    : await fetchPublishedReports(args.env);
  if (!Array.isArray(reports)) throw new Error('report input must be an array');
  fs.mkdirSync(args.outputDir, { recursive: true });
  const expected = new Set();
  for (const report of reports) {
    if (!SAFE_SLUG.test(String(report?.slug || ''))) throw new Error(`unsafe report slug: ${report?.slug || ''}`);
    const filename = `${report.slug}.html`;
    expected.add(filename);
    fs.writeFileSync(path.join(args.outputDir, filename), renderStaticReport(report, args.siteUrl), 'utf8');
  }
  for (const filename of fs.readdirSync(args.outputDir)) {
    if (filename.endsWith('.html') && !expected.has(filename)) fs.rmSync(path.join(args.outputDir, filename));
  }
  const sitemap = fs.readFileSync(args.sitemap, 'utf8');
  fs.writeFileSync(args.sitemap, updateSitemap(sitemap, reports, args.siteUrl), 'utf8');
  process.stdout.write(JSON.stringify({ ok: true, reports: reports.length, outputDir: args.outputDir }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
