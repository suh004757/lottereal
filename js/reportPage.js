import {
  getLatestReport,
  getReportBySlug,
  incrementReportViews,
  listPublishedReports
} from './services/reportAdapter.js';
import { findMatchingLandingConfigs } from './config/reportLandingConfig.js';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';

const urlParams = new URLSearchParams(window.location.search);
const reportSlug = urlParams.get('slug');

let currentReport = null;
let publishedReports = [];

document.addEventListener('DOMContentLoaded', () => {
  loadReport();

  const modal = document.getElementById('evidence-modal');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeEvidence();
      }
    });
  }
});

async function loadReport() {
  try {
    currentReport = reportSlug
      ? await getReportBySlug(reportSlug)
      : await getLatestReport();

    if (!currentReport) {
      showError('리포트를 찾을 수 없습니다.');
      return;
    }

    publishedReports = await listPublishedReports({ limit: 20 });

    renderMetadata();
    renderReport();
    renderRevisions();
    renderArchive();
    renderRelatedHubs();
    renderRelatedReports();
    renderNeighbors();

    incrementReportViews(currentReport.slug).catch((error) => {
      console.warn('[Analytics] Failed to increment view count:', error);
    });
  } catch (error) {
    console.error('Error loading report:', error);
    showError('리포트를 불러오는 중 오류가 발생했습니다.');
  }
}

function renderMetadata() {
  const titleNode = document.getElementById('report-title');
  const summaryNode = document.getElementById('report-summary');
  const updatedNode = document.getElementById('report-updated');

  if (titleNode) titleNode.textContent = currentReport.title || '';
  if (summaryNode) summaryNode.textContent = currentReport.summary || '';
  if (updatedNode) updatedNode.textContent = formatDate(currentReport.updated_at);

  applySeo();
}

function renderReport() {
  const contentDiv = document.getElementById('report-content');
  if (!contentDiv) return;

  try {
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    const rawHtml = marked.parse(currentReport.report_md || '');
    const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
    contentDiv.innerHTML = safeHtml;
  } catch (error) {
    console.error('Error rendering markdown:', error);
    contentDiv.innerHTML = '<p>리포트를 렌더링하지 못했습니다.</p>';
  }
}

function renderRevisions() {
  const listDiv = document.getElementById('revision-list');
  if (!listDiv) return;

  listDiv.innerHTML = `
    <div class="lr-revision-item">
      <div class="lr-revision-header">
        <span class="lr-revision-version">Latest</span>
        <span class="lr-revision-date">${formatDate(currentReport.updated_at)}</span>
      </div>
      <p class="lr-revision-changes">최종 업데이트</p>
    </div>
  `;
}

function renderArchive() {
  const archiveList = document.getElementById('report-archive-list');
  if (!archiveList) return;

  const reports = publishedReports
    .filter((report) => report.slug !== currentReport.slug)
    .slice(0, 6);

  renderReportCards(archiveList, reports, '다른 발행 리포트가 없습니다.');
}

function renderRelatedHubs() {
  const container = document.getElementById('report-related-hubs');
  if (!container) return;

  const hubs = findMatchingLandingConfigs(currentReport);

  if (!hubs.length) {
    container.innerHTML = '<div class="lr-report-hub__empty">연결할 지역 리포트 허브가 아직 없습니다.</div>';
    return;
  }

  container.innerHTML = hubs.map((hub) => `
    <a class="lr-report-hub-link" href="${escapeHtml(hub.path)}">
      <p class="lr-kicker">${escapeHtml(hub.heroKicker || 'Report Hub')}</p>
      <h3>${escapeHtml(hub.heroTitle || '')}</h3>
      <p>${escapeHtml(hub.description || '')}</p>
      <span class="lr-link">허브 보기</span>
    </a>
  `).join('');
}

function renderRelatedReports() {
  const container = document.getElementById('report-related-list');
  if (!container) return;

  const reports = publishedReports
    .filter((report) => report.slug !== currentReport.slug)
    .map((report) => ({
      report,
      score: scoreRelatedReport(report, currentReport)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.report.updated_at) - new Date(a.report.updated_at);
    })
    .map((entry) => entry.report)
    .slice(0, 4);

  renderReportCards(container, reports, '같이 볼 관련 리포트가 아직 없습니다.');
}

function renderNeighbors() {
  const container = document.getElementById('report-neighbors');
  if (!container) return;

  const index = publishedReports.findIndex((report) => report.slug === currentReport.slug);
  const newerReport = index > 0 ? publishedReports[index - 1] : null;
  const olderReport = index >= 0 && index < publishedReports.length - 1 ? publishedReports[index + 1] : null;

  if (!newerReport && !olderReport) {
    container.innerHTML = '<div class="lr-report-hub__empty">이동할 이전 또는 다음 리포트가 없습니다.</div>';
    return;
  }

  container.innerHTML = `
    ${renderNeighborCard('Newer Report', newerReport)}
    ${renderNeighborCard('Older Report', olderReport)}
  `;
}

function renderNeighborCard(label, report) {
  if (!report) {
    return `
      <div class="lr-report-neighbor lr-report-neighbor--empty">
        <p class="lr-kicker">${escapeHtml(label)}</p>
        <h3>없음</h3>
        <p>현재 이 방향으로 연결할 리포트가 없습니다.</p>
      </div>
    `;
  }

  return `
    <a class="lr-report-neighbor" href="report.html?slug=${encodeURIComponent(report.slug)}">
      <p class="lr-kicker">${escapeHtml(label)}</p>
      <h3>${escapeHtml(report.title || '')}</h3>
      <p>${escapeHtml(report.summary || '')}</p>
      <span class="lr-link">${formatDate(report.updated_at)}</span>
    </a>
  `;
}

function renderReportCards(container, reports, emptyMessage) {
  if (!reports.length) {
    container.innerHTML = `<div class="lr-report-archive__empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = reports.map((report) => `
    <article class="lr-report-archive__item">
      <p class="lr-badge">Published</p>
      <h3>${escapeHtml(report.title || '')}</h3>
      <p>${escapeHtml(report.summary || '')}</p>
      <div class="lr-card__meta">
        <span>${formatDate(report.updated_at)}</span>
        <span>조회수 ${Number(report.view_count || 0).toLocaleString()}회</span>
      </div>
      <div class="lr-actions">
        <a class="lr-btn lr-btn--primary" href="report.html?slug=${encodeURIComponent(report.slug)}">상세보기</a>
      </div>
    </article>
  `).join('');
}

function scoreRelatedReport(candidate, reference) {
  const candidateText = [
    candidate.title,
    candidate.summary,
    candidate.metadata?.region,
    candidate.metadata?.content_type
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const keywords = extractKeywords(reference);
  return keywords.reduce((score, keyword) => {
    return candidateText.includes(keyword) ? score + 1 : score;
  }, 0);
}

function extractKeywords(report) {
  const baseTerms = [
    report.metadata?.region,
    report.metadata?.content_type,
    ...(String(report.title || '').match(/[가-힣A-Za-z0-9]+/g) || []),
    ...(String(report.summary || '').match(/[가-힣A-Za-z0-9]+/g) || [])
  ]
    .filter(Boolean)
    .map((term) => String(term).toLowerCase())
    .filter((term) => term.length >= 2);

  return [...new Set(baseTerms)].slice(0, 12);
}

window.openEvidence = function openEvidence() {
  const evidence = currentReport?.evidence_json || [];
  const sourcesHtml = evidence.map((source) => `
    <div style="padding: 1rem; background: #f9fafb; border-radius: 0.5rem; margin-bottom: 1rem;">
      <strong style="color: #111827;">${escapeHtml(source.name)}</strong><br>
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; font-size: 0.875rem;">${escapeHtml(source.url)}</a><br>
      <span style="color: #6b7280; font-size: 0.875rem;">수집일: ${escapeHtml(source.fetchedAt || '')}</span><br>
      <span style="color: #6b7280; font-size: 0.875rem;">범위: ${escapeHtml(source.coverage || '')}</span>
    </div>
  `).join('');

  const content = document.getElementById('evidence-content');
  const modal = document.getElementById('evidence-modal');
  if (!content || !modal) return;

  content.innerHTML = `
    <h4 style="margin-bottom: 1.5rem; color: #111827;">데이터 출처</h4>
    <div>${sourcesHtml || '<p style="color: #6b7280;">출처 정보가 없습니다.</p>'}</div>
  `;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closeEvidence = function closeEvidence() {
  const modal = document.getElementById('evidence-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
};

window.copySummary = function copySummary() {
  const summary = `${currentReport.title}\n\n${currentReport.summary}\n\n자세한 내용: https://lottes.co.kr/report.html?slug=${currentReport.slug}`;

  navigator.clipboard.writeText(summary).then(() => {
    showNotification('요약을 클립보드에 복사했습니다.');
  }).catch((error) => {
    console.error('Failed to copy summary:', error);
    showNotification('요약 복사에 실패했습니다.');
  });
};

function showNotification(message) {
  const notification = document.getElementById('copy-notification');
  if (!notification) return;

  notification.textContent = message;
  notification.style.display = 'block';

  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

function showError(message) {
  const contentDiv = document.getElementById('report-content');
  if (!contentDiv) return;

  contentDiv.innerHTML = `<p style="color: #dc2626; text-align: center; padding: 2rem;">${escapeHtml(message)}</p>`;
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

function applySeo() {
  const canonical = buildAbsoluteUrl(`report.html?slug=${encodeURIComponent(currentReport.slug || '')}`);
  const title = currentReport.title
    ? `${currentReport.title} | Lotte Real Estate`
    : 'Market Report | Lotte Real Estate';
  const description = currentReport.summary || 'Data-based real estate market report from Lotte Real Estate.';
  const image = buildAbsoluteUrl('img/bg-img/lotte_street_view.png');
  const publishedTime = currentReport.created_at || currentReport.updated_at;
  const modifiedTime = currentReport.updated_at || currentReport.created_at;

  updateSeoMeta({
    title,
    description,
    canonical,
    ogImage: image,
    type: 'article',
    locale: 'ko_KR',
    siteName: 'Lotte Real Estate'
  });

  renderJsonLd({
    id: 'report-breadcrumb',
    data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: buildAbsoluteUrl('/')
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Market Report',
          item: buildAbsoluteUrl('/report.html')
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: currentReport.title || 'Market Report',
          item: canonical
        }
      ]
    }
  });

  renderJsonLd({
    id: 'report-article',
    data: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: currentReport.title || 'Market Report',
      description,
      inLanguage: 'ko-KR',
      datePublished: publishedTime,
      dateModified: modifiedTime,
      mainEntityOfPage: canonical,
      image: [image],
      author: {
        '@type': 'Organization',
        name: 'Lotte Real Estate'
      },
      publisher: {
        '@type': 'Organization',
        name: 'Lotte Real Estate',
        logo: {
          '@type': 'ImageObject',
          url: image
        }
      }
    }
  });
}
