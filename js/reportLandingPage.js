import { getLatestReport, listPublishedReports } from './services/reportAdapter.js';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';
import { getReportLandingConfigByKey } from './config/reportLandingConfig.js';

const landingKey = document.body.dataset.reportLanding;
const config = getReportLandingConfigByKey(landingKey);

document.addEventListener('DOMContentLoaded', () => {
  if (!config) return;

  initializeLanding().catch((error) => {
    console.error('Failed to initialize report landing page:', error);
  });
});

async function initializeLanding() {
  const reports = await listPublishedReports({ limit: 20 });
  const relatedReports = getRelatedReports(reports, config);
  const featuredReport = relatedReports[0] || await getLatestReport();

  renderHero(featuredReport);
  renderIntro();
  renderFocusPoints();
  renderFeaturedReport(featuredReport);
  renderReportList(relatedReports.filter((report) => report?.slug !== featuredReport?.slug).slice(0, 6));
  renderInsights();
  renderFaq();
  renderCta();
  applySeo(featuredReport, relatedReports);
}

function renderHero(featuredReport) {
  setText('report-landing-kicker', config.heroKicker);
  setText('report-landing-title', config.heroTitle);
  setText('report-landing-summary', config.heroBody);
  setText(
    'report-landing-updated',
    featuredReport?.updated_at ? formatDate(featuredReport.updated_at) : '최신 발행 기준'
  );
}

function renderIntro() {
  const section = document.getElementById('report-landing-intro');
  if (!section) return;

  section.innerHTML = config.introSections.map((item) => `
    <article class="lr-report-hub__content-block">
      <h3>${escapeHtml(item.heading)}</h3>
      <p>${escapeHtml(item.content)}</p>
    </article>
  `).join('');
}

function renderFocusPoints() {
  const list = document.getElementById('report-landing-focus');
  if (!list) return;

  list.innerHTML = config.focusPoints.map((point) => `
    <li>${escapeHtml(point)}</li>
  `).join('');
}

function renderFeaturedReport(report) {
  const container = document.getElementById('report-landing-featured');
  if (!container) return;

  if (!report) {
    container.innerHTML = '<div class="lr-report-hub__empty">관련 리포트가 아직 없습니다.</div>';
    return;
  }

  container.innerHTML = `
    <article class="lr-card lr-card--feature">
      <div class="lr-card__body">
        <p class="lr-badge">Featured Report</p>
        <h3>${escapeHtml(report.title || '')}</h3>
        <p class="lr-text">${escapeHtml(report.summary || '')}</p>
        <div class="lr-card__meta">
          <span>${formatDate(report.updated_at)}</span>
          <span>조회수 ${Number(report.view_count || 0).toLocaleString()}회</span>
        </div>
        <div class="lr-actions">
          <a class="lr-btn lr-btn--primary" href="report.html?slug=${encodeURIComponent(report.slug)}">최신 리포트 보기</a>
        </div>
      </div>
    </article>
  `;
}

function renderReportList(reports) {
  const container = document.getElementById('report-landing-list');
  if (!container) return;

  if (!reports.length) {
    container.innerHTML = '<div class="lr-report-hub__empty">추가 리포트가 아직 없습니다.</div>';
    return;
  }

  container.innerHTML = reports.map((report) => `
    <article class="lr-report-hub__report-card">
      <p class="lr-badge">Report</p>
      <h3>${escapeHtml(report.title || '')}</h3>
      <p>${escapeHtml(report.summary || '')}</p>
      <div class="lr-card__meta">
        <span>${formatDate(report.updated_at)}</span>
        <span>조회수 ${Number(report.view_count || 0).toLocaleString()}회</span>
      </div>
      <a class="lr-btn lr-btn--ghost" href="report.html?slug=${encodeURIComponent(report.slug)}">리포트 읽기</a>
    </article>
  `).join('');
}

function renderInsights() {
  const container = document.getElementById('report-landing-insights');
  if (!container) return;

  const items = (config.insightSlugs || []).map((slug) => `
    <a class="lr-report-hub__insight-link" href="insight-detail.html?slug=${encodeURIComponent(slug)}">
      ${escapeHtml(formatInsightLabel(slug))}
    </a>
  `);

  container.innerHTML = items.length
    ? items.join('')
    : '<div class="lr-report-hub__empty">연결할 인사이트가 아직 없습니다.</div>';
}

function renderFaq() {
  const container = document.getElementById('report-landing-faq');
  if (!container) return;

  container.innerHTML = config.faq.map((item) => `
    <article class="lr-report-hub__faq-item">
      <h3>${escapeHtml(item.question)}</h3>
      <p>${escapeHtml(item.answer)}</p>
    </article>
  `).join('');
}

function renderCta() {
  const link = document.getElementById('report-landing-cta-link');
  if (!link) return;
  link.href = config.ctaHref || 'contact.html';
}

function applySeo(featuredReport, reports) {
  const canonical = buildAbsoluteUrl(config.path);
  const image = buildAbsoluteUrl('img/bg-img/lotte_street_view.png');

  updateSeoMeta({
    title: config.title,
    description: config.description,
    canonical,
    ogImage: image,
    type: 'website',
    locale: 'ko_KR',
    siteName: 'Lotte Real Estate'
  });

  renderJsonLd({
    id: `landing-breadcrumb-${config.key}`,
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: buildAbsoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Market Report', item: buildAbsoluteUrl('/report.html') },
        { '@type': 'ListItem', position: 3, name: config.heroTitle, item: canonical }
      ]
    }
  });

  renderJsonLd({
    id: `landing-collection-${config.key}`,
    data: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: config.heroTitle,
      description: config.description,
      url: canonical,
      inLanguage: 'ko-KR',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: reports.slice(0, 6).map((report, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: buildAbsoluteUrl(`report.html?slug=${encodeURIComponent(report.slug)}`),
          name: report.title
        }))
      },
      primaryImageOfPage: image,
      about: featuredReport?.title || config.heroTitle
    }
  });
}

function getRelatedReports(reports, landingConfig) {
  return reports
    .map((report) => ({
      report,
      score: scoreReport(report, landingConfig)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.report.updated_at) - new Date(a.report.updated_at);
    })
    .map((entry) => entry.report);
}

function scoreReport(report, landingConfig) {
  let score = 0;
  const haystack = [
    report.title,
    report.summary,
    report.metadata?.region,
    report.metadata?.content_type
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const regions = landingConfig.reportMatch?.metadataRegion || [];
  const keywords = landingConfig.reportMatch?.keywords || [];

  keywords.forEach((keyword) => {
    if (haystack.includes(String(keyword).toLowerCase())) {
      score += 2;
    }
  });

  regions.forEach((region) => {
    if (haystack.includes(String(region).toLowerCase())) {
      score += 4;
    }
  });

  return score;
}

function formatInsightLabel(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
