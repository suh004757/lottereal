import { listPublishedReports } from './services/reportAdapter.js';

const section = document.querySelector('[data-report-section]');

if (section) {
  const featuredContainer = section.querySelector('[data-report-featured]');
  const secondaryContainer = section.querySelector('[data-report-secondary-list]');
  const reloadBtn = section.querySelector('[data-report-reload]');
  const viewLink = section.querySelector('[data-report-link]');
  const path = window.location.pathname.toLowerCase();
  const isEnglish = path.endsWith('en.html') || path.endsWith('/en.html');

  const copy = isEnglish
    ? {
        loading: 'Loading latest reports...',
        emptyTitle: 'No published reports yet.',
        emptySummary: 'Published reports will appear here automatically.',
        errorTitle: 'Failed to load reports.',
        errorSummary: 'Please try again later.',
        published: 'Published',
        views: 'views',
        cta: 'View Details'
      }
    : {
        loading: '최신 리포트를 불러오는 중입니다.',
        emptyTitle: '발행된 리포트가 아직 없습니다.',
        emptySummary: '리포트를 발행하면 이 영역에 자동 노출됩니다.',
        errorTitle: '리포트를 불러오지 못했습니다.',
        errorSummary: '잠시 후 다시 시도해 주세요.',
        published: '발행됨',
        views: '조회',
        cta: '상세보기'
      };

  init();

  async function init() {
    renderLoading();
    await loadReports();
    reloadBtn?.addEventListener('click', async () => {
      renderLoading();
      await loadReports();
    });
    if (viewLink) {
      viewLink.href = 'report.html';
    }
  }

  async function loadReports() {
    try {
      const reports = await listPublishedReports({ limit: 3 });
      if (!reports.length) {
        renderEmpty();
        return;
      }
      renderReports(reports);
    } catch (error) {
      console.error('[HomeReport] Failed to load reports', error);
      renderError();
    }
  }

  function renderLoading() {
    if (featuredContainer) {
      featuredContainer.innerHTML = renderSkeleton(copy.loading);
    }
    if (secondaryContainer) {
      secondaryContainer.innerHTML = '';
    }
  }

  function renderEmpty() {
    if (featuredContainer) {
      featuredContainer.innerHTML = renderStateCard(copy.emptyTitle, copy.emptySummary);
    }
    if (secondaryContainer) {
      secondaryContainer.innerHTML = '';
    }
  }

  function renderError() {
    if (featuredContainer) {
      featuredContainer.innerHTML = renderStateCard(copy.errorTitle, copy.errorSummary, true);
    }
    if (secondaryContainer) {
      secondaryContainer.innerHTML = '';
    }
  }

  function renderReports(reports) {
    const [featured, ...secondary] = reports;
    if (featuredContainer) {
      featuredContainer.innerHTML = renderFeatureCard(featured);
    }
    if (secondaryContainer) {
      secondaryContainer.innerHTML = secondary.map(renderSecondaryCard).join('');
    }
  }

  function renderFeatureCard(report) {
    return `
      <article class="lr-card lr-card--feature">
        <div class="lr-card__body">
          <p class="lr-badge">${copy.published}</p>
          <h3>${escapeHtml(report.title || 'Report')}</h3>
          <p class="lr-text">${escapeHtml(extractSummary(report))}</p>
          <div class="lr-card__meta">
            <span>${formatUpdated(report.updated_at)}</span>
            <span>${formatViews(report.view_count)}</span>
          </div>
          <div class="lr-actions">
            <a class="lr-btn lr-btn--primary" href="${getReportHref(report.slug)}">${copy.cta}</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderSecondaryCard(report) {
    return `
      <article class="lr-card lr-report-card--secondary">
        <div class="lr-card__body">
          <p class="lr-badge">${copy.published}</p>
          <h3>${escapeHtml(report.title || 'Report')}</h3>
          <p class="lr-text">${escapeHtml(extractSummary(report))}</p>
          <div class="lr-card__meta">
            <span>${formatUpdated(report.updated_at)}</span>
            <span>${formatViews(report.view_count)}</span>
          </div>
          <div class="lr-actions">
            <a class="lr-btn lr-btn--primary" href="${getReportHref(report.slug)}">${copy.cta}</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderStateCard(title, summary, isError = false) {
    return `
      <article class="lr-card lr-card--feature${isError ? ' is-error' : ''}">
        <div class="lr-card__body">
          <p class="lr-badge">${isError ? 'Error' : copy.published}</p>
          <h3>${escapeHtml(title)}</h3>
          <p class="lr-text">${escapeHtml(summary)}</p>
        </div>
      </article>
    `;
  }

  function renderSkeleton(title) {
    return `
      <article class="lr-card lr-card--feature">
        <div class="lr-card__body">
          <p class="lr-badge">${copy.published}</p>
          <h3>${escapeHtml(title)}</h3>
          <p class="lr-text">&nbsp;</p>
        </div>
      </article>
    `;
  }

  function extractSummary(report) {
    if (report.summary) return report.summary;
    if (!report.report_md) return '';
    return report.report_md
      .split(/\n\n+/)
      .map((block) => block.replace(/[#>*-]/g, '').trim())
      .filter(Boolean)[0] || '';
  }

  function formatUpdated(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(isEnglish ? 'en-US' : 'ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatViews(value) {
    const count = Number(value || 0).toLocaleString();
    return isEnglish ? `${count} ${copy.views}` : `${copy.views} ${count}회`;
  }

  function getReportHref(slug) {
    return slug ? `report.html?slug=${slug}` : 'report.html';
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
