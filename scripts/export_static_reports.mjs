#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Marked, Renderer } = require('../js/vendor/marked-18.0.11.min.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARCHIVE_START = '<!-- STATIC_REPORT_ARCHIVE_START -->';
const ARCHIVE_END = '<!-- STATIC_REPORT_ARCHIVE_END -->';
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
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
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
    published: dateOnly(report?.created_at),
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

export function renderStaticReport(report, siteUrl = 'https://lottes.co.kr', options = {}) {
  const slug = String(report?.slug || '');
  if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe report slug: ${slug}`);
  const base = String(siteUrl).replace(/\/$/, '');
  const canonical = `${base}/reports/${slug}.html`;
  const title = String(report?.title || '').trim();
  const summary = String(report?.summary || '').trim();
  if (!title || !summary) throw new Error(`missing title or summary: ${slug}`);
  const published = dateOnly(report?.created_at);
  const contentHash = options.contentHash || publicContentHash(report);
  const modified = dateOnly(options.modifiedDate) || dateOnly(report?.updated_at) || published;
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
  <meta name="lottereal:content-hash" content="${contentHash}">
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
  <footer class="lr-footer"><div class="lr-container lr-footer__content"><div><p class="lr-kicker">롯데부동산</p><p class="lr-text">서울시 송파구 백제고분로27길 27 1층</p><p class="lr-text">문의전화: 0507-1402-5055 | 중개사무소등록번호 11710-2018-00141</p></div><div class="lr-footer__links"><a href="../privacy.html">개인정보처리방침</a><a href="../EN.html">ENGLISH</a></div></div><p class="lr-footer__copy">© ${COPYRIGHT_YEAR} 롯데부동산. All rights reserved.</p></footer>
  <script src="../js/analyticsEvents.js"></script><script src="../js/mobileNav.js"></script><script type="module" src="../js/staticReportPage.mjs"></script>
</body>
</html>\n`;
}

function resolveModifiedDate(report, existingHtml, siteUrl) {
  const sourceModified = dateOnly(report?.updated_at) || dateOnly(report?.created_at);
  if (!existingHtml) return sourceModified;
  const previous = previousExportState(existingHtml);
  const published = dateOnly(report?.created_at);
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
    const modified = modifiedDates.get(slug) || dateOnly(report.updated_at) || dateOnly(report.created_at);
    return `  <url>\n    <loc>${base}/reports/${slug}.html</loc>\n    <lastmod>${modified}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`;
  }).join('\n');
  if (!next.includes('</urlset>')) throw new Error('invalid sitemap: missing </urlset>');
  return next.replace(/\s*<\/urlset>\s*$/, `\n${entries}\n</urlset>\n`);
}

function updateReportArchive(reportPageText, reports) {
  const start = reportPageText.indexOf(ARCHIVE_START);
  const end = reportPageText.indexOf(ARCHIVE_END);
  if (start < 0 || end < 0 || end <= start
      || reportPageText.lastIndexOf(ARCHIVE_START) !== start
      || reportPageText.lastIndexOf(ARCHIVE_END) !== end) {
    throw new Error('invalid report archive markers');
  }
  const ordered = [...reports].sort((left, right) => {
    const instantOrder = parseRequiredTimestamp(right, 'created_at')
      - parseRequiredTimestamp(left, 'created_at');
    const leftSlug = String(left.slug);
    const rightSlug = String(right.slug);
    return instantOrder || (leftSlug < rightSlug ? -1 : leftSlug > rightSlug ? 1 : 0);
  });
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
  const args = { outputDir: path.join(REPO, 'reports'), sitemap: path.join(REPO, 'Sitemap.xml'), reportPage: path.join(REPO, 'report.html'), siteUrl: 'https://lottes.co.kr', env: '/opt/data/.env', allowShrink: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') args.input = argv[++index];
    else if (value === '--output-dir') args.outputDir = argv[++index];
    else if (value === '--sitemap') args.sitemap = argv[++index];
    else if (value === '--report-page') args.reportPage = argv[++index];
    else if (value === '--site-url') args.siteUrl = argv[++index];
    else if (value === '--env') args.env = argv[++index];
    else if (value === '--allow-shrink') args.allowShrink = true;
    else throw new Error(`unknown argument: ${value}`);
  }
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

function allowedTarget(target, args) {
  const resolved = path.resolve(target);
  if (resolved === path.resolve(args.sitemap) || resolved === path.resolve(args.reportPage)) return true;
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
      rendered.set(filename, renderStaticReport(report, args.siteUrl, { contentHash, modifiedDate }));
    }
    const missing = existing.filter((filename) => !expected.has(filename));
    if ((reports.length === 0 || missing.length > 0) && !args.allowShrink) {
      const detail = missing.length ? `: ${missing.join(', ')}` : '';
      throw new Error(`refusing to remove published report snapshots without --allow-shrink${detail}`);
    }
    const sitemap = fs.readFileSync(args.sitemap, 'utf8');
    const nextSitemap = updateSitemap(sitemap, reports, args.siteUrl, modifiedDates);
    const reportPage = fs.readFileSync(args.reportPage, 'utf8');
    const nextReportPage = updateReportArchive(reportPage, reports);
    const specifications = [];
    for (const [filename, html] of rendered) {
      specifications.push({ kind: 'replace', target: path.join(args.outputDir, filename), content: html });
    }
    for (const filename of missing) {
      specifications.push({ kind: 'delete', target: path.join(args.outputDir, filename) });
    }
    specifications.push({ kind: 'replace', target: args.sitemap, content: nextSitemap });
    specifications.push({ kind: 'replace', target: args.reportPage, content: nextReportPage });
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
  process.stdout.write(JSON.stringify({ ok: true, reports: reports.length, outputDir: args.outputDir }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
