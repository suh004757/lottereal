import { getLatestReport, getReportBySlug, incrementReportViews, listPublishedReports } from './services/reportAdapter.js';
import { buildAbsoluteUrl, renderJsonLd, updateSeoMeta } from './utils/seo.js';

const urlParams = new URLSearchParams(window.location.search);
const reportSlug = urlParams.get('slug');

let currentReport = null;

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

    renderMetadata();
    renderReport();
    renderRevisions();
    await renderArchive();
    incrementReportViews(currentReport.slug).catch((error) => {
      console.warn('[Analytics] Failed to increment view count:', error);
    });
  } catch (error) {
    console.error('Error loading report:', error);
    showError('리포트를 불러오는 데 실패했습니다.');
  }
}

function renderMetadata() {
  document.getElementById('report-title').textContent = currentReport.title || '';
  document.getElementById('report-summary').textContent = currentReport.summary || '';
  document.getElementById('report-updated').textContent = formatDate(currentReport.updated_at);
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
    contentDiv.innerHTML = '<p>리포트를 불러오는 데 실패했습니다.</p>';
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

async function renderArchive() {
  const archiveList = document.getElementById('report-archive-list');
  if (!archiveList) return;

  const reports = await listPublishedReports({
    limit: 6,
    excludeSlug: currentReport.slug
  });

  if (!reports.length) {
    archiveList.innerHTML = '<div class="lr-report-archive__empty">다른 발행 리포트가 없습니다.</div>';
    return;
  }

  archiveList.innerHTML = reports.map((report) => `
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

window.openEvidence = function () {
  const evidence = currentReport?.evidence_json || [];
  const sourcesHtml = evidence.map((source) => `
    <div style="padding: 1rem; background: #f9fafb; border-radius: 0.5rem; margin-bottom: 1rem;">
      <strong style="color: #111827;">${escapeHtml(source.name)}</strong><br>
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; font-size: 0.875rem;">${escapeHtml(source.url)}</a><br>
      <span style="color: #6b7280; font-size: 0.875rem;">수집일: ${escapeHtml(source.fetchedAt || '')}</span><br>
      <span style="color: #6b7280; font-size: 0.875rem;">범위: ${escapeHtml(source.coverage || '')}</span>
    </div>
  `).join('');

  document.getElementById('evidence-content').innerHTML = `
    <h4 style="margin-bottom: 1.5rem; color: #111827;">데이터 출처</h4>
    <div>${sourcesHtml || '<p style="color: #6b7280;">출처 정보가 없습니다.</p>'}</div>
  `;
  document.getElementById('evidence-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closeEvidence = function () {
  document.getElementById('evidence-modal').style.display = 'none';
  document.body.style.overflow = '';
};

window.copySummary = function () {
  const summary = `${currentReport.title}\n\n${currentReport.summary}\n\n자세한 내용: https://lottes.co.kr/report.html?slug=${currentReport.slug}`;
  navigator.clipboard.writeText(summary).then(() => {
    showNotification('요약을 클립보드에 복사했습니다.');
  }).catch((error) => {
    console.error('복사 실패:', error);
    showNotification('복사에 실패했습니다.');
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
  const description = currentReport.summary
    || 'Data-based real estate market report from Lotte Real Estate.';
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
