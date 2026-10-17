import { listPublishedReports } from './services/reportAdapter.js';
import { filterContentForLanguage } from './localizedHomeContent.mjs';
import { formatReportDateMeta } from './utils/reportDates.mjs';
import { reportStaticHref } from './utils/reportUrls.mjs';

const section = document.querySelector('[data-report-section]');

const MARKET_COVER = `
  <div class="lr-report-cover lr-report-cover--market" aria-hidden="true">
    <svg viewBox="0 0 240 160" focusable="false">
      <path class="lrc-grid" d="M20 40H220M20 80H220M20 120H220"/>
      <rect class="lrc-bar" x="34" y="96" width="18" height="44" rx="4"/>
      <rect class="lrc-bar" x="74" y="78" width="18" height="62" rx="4"/>
      <rect class="lrc-bar" x="114" y="88" width="18" height="52" rx="4"/>
      <rect class="lrc-bar" x="154" y="70" width="18" height="70" rx="4"/>
      <rect class="lrc-bar" x="194" y="84" width="18" height="56" rx="4"/>
      <path class="lrc-line" pathLength="1" d="M43 84L83 64 123 76 163 56 203 68"/>
      <circle class="lrc-dot" cx="203" cy="68" r="5"/>
    </svg>
  </div>`;

const DISPUTE_COVER = `
  <div class="lr-report-cover lr-report-cover--dispute" aria-hidden="true">
    <svg viewBox="0 0 240 160" focusable="false">
      <rect class="lrc-doc" x="62" y="22" width="92" height="118" rx="10"/>
      <rect class="lrc-doc-line" x="76" y="42" width="64" height="6" rx="3"/>
      <rect class="lrc-doc-line" x="76" y="56" width="52" height="6" rx="3"/>
      <rect class="lrc-doc-line" x="76" y="70" width="60" height="6" rx="3"/>
      <rect class="lrc-doc-line" x="76" y="84" width="40" height="6" rx="3"/>
      <g class="lrc-scale">
        <path d="M176 60V128M156 128H196M146 68H206"/>
        <path d="M146 68L136 92H156ZM206 68L196 92H216Z"/>
      </g>
      <path class="lrc-check" pathLength="1" d="M82 116l10 10 20-22"/>
    </svg>
  </div>`;

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
        emptyTitle: 'Start with our English Seoul property guide.',
        emptySummary: 'Reviewed English market notes will appear here as they are published.',
        errorTitle: 'Failed to load reports.',
        errorSummary: 'Please try again later.',
        published: 'Published',
        legal: 'Checklist',
        market: 'Market Report',
        dispute: 'Contract & Dispute',
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
        legal: '계약 체크리스트',
        market: '시장 리포트',
        dispute: '계약·분쟁 사례',
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
      const publishedReports = await listPublishedReports({ limit: 30 });
      const reports = filterContentForLanguage(publishedReports, isEnglish ? 'en' : 'ko');
      if (!reports.length) {
        renderEmpty();
        return;
      }
      renderReports(selectRepresentativeReports(reports));
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

  function selectRepresentativeReports(reports) {
    const dispute = reports.find((report) => {
      const content_type = String(report.metadata?.content_type || '').toLowerCase();
      return content_type === 'dispute_case';
    });
    const market = reports.find((report) => {
      const content_type = String(report.metadata?.content_type || '').toLowerCase();
      return content_type !== 'dispute_case';
    });
    const selected = [market, dispute].filter(Boolean);
    return selected.length === 2 ? selected : reports.slice(0, 2);
  }

  function renderFeatureCard(report) {
    return `
      <article class="lr-card lr-card--feature lr-card--with-cover">
        ${renderCover(report)}
        <div class="lr-card__body">
          <p class="lr-badge">${getReportLabel(report)}</p>
          <h3>${escapeHtml(report.title || 'Report')}</h3>
          <p class="lr-text">${escapeHtml(extractSummary(report))}</p>
          <div class="lr-card__meta">
            <span>${formatReportDateMeta(report, { locale: isEnglish ? 'en-US' : 'ko-KR' })}</span>
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
          <p class="lr-badge">${getReportLabel(report)}</p>
          <h3>${escapeHtml(report.title || 'Report')}</h3>
          <p class="lr-text">${escapeHtml(extractSummary(report))}</p>
          <div class="lr-card__meta">
            <span>${formatReportDateMeta(report, { locale: isEnglish ? 'en-US' : 'ko-KR' })}</span>
          </div>
          <div class="lr-actions">
            <a class="lr-btn lr-btn--primary" href="${getReportHref(report.slug)}">${copy.cta}</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderCover(report) {
    const isDispute = String(report.metadata?.content_type || '').toLowerCase() === 'dispute_case';
    return isDispute ? DISPUTE_COVER : MARKET_COVER;
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

  function getReportLabel(report) {
    const type = String(report.metadata?.content_type || '').toLowerCase();
    if (type === 'dispute_case') return copy.dispute;
    if (type.includes('legal')) return copy.legal || copy.published;
    return copy.market || copy.published;
  }

  function extractSummary(report) {
    if (report.summary) return report.summary;
    if (!report.report_md) return '';
    return report.report_md
      .split(/\n\n+/)
      .map((block) => block.replace(/[#>*-]/g, '').trim())
      .filter(Boolean)[0] || '';
  }

  function getReportHref(slug) {
    return reportStaticHref(slug);
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
