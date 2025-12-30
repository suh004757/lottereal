import { getLatestReport } from './services/reportAdapter.js';

const section = document.querySelector('[data-report-section]');

if (!section) {
  console.info('[HomeReport] Report section not found on this page.');
} else {
  const card = section.querySelector('[data-report-card]');
  const titleEl = section.querySelector('[data-report-title]');
  const summaryEl = section.querySelector('[data-report-summary]');
  const updatedEl = section.querySelector('[data-report-updated]');
  const viewsEl = section.querySelector('[data-report-views]');
  const statusEl = section.querySelector('[data-report-status]');
  const reloadBtn = section.querySelector('[data-report-reload]');
  const viewLink = section.querySelector('[data-report-link]');

  const messages = {
    loadingTitle: '최신 리포트를 불러오는 중입니다.',
    loadingSummary: '잠시만 기다려 주세요.',
    emptyTitle: '발행된 리포트가 아직 없습니다.',
    emptySummary: '관리자 페이지에서 리포트를 발행하면 자동으로 노출됩니다.',
    errorTitle: '리포트를 불러오지 못했습니다.',
    errorSummary: '네트워크 상태를 확인한 후 다시 시도해 주세요.'
  };

  init();

  async function init() {
    setLoading();
    await loadReport();
  }

  async function loadReport() {
    try {
      const report = await getLatestReport();
      if (!report) {
        setEmpty();
        return;
      }
      renderReport(report);
    } catch (error) {
      console.error('[HomeReport] Failed to load latest report', error);
      setError();
    }
  }

  function renderReport(report) {
    if (statusEl) statusEl.textContent = '발행됨';
    if (titleEl) titleEl.textContent = report.title || '시장 리포트';
    if (summaryEl) summaryEl.textContent = extractSummary(report);
    if (updatedEl) updatedEl.textContent = formatUpdated(report.updated_at);
    if (viewsEl) viewsEl.textContent = `조회수 ${Number(report.view_count || 0).toLocaleString()}회`;
    if (card) card.classList.remove('is-error');
    if (viewLink) {
      const slug = report.slug ? `?slug=${report.slug}` : '';
      viewLink.href = `report.html${slug}`;
    }
  }

  function setLoading() {
    if (statusEl) statusEl.textContent = '로딩 중';
    if (titleEl) titleEl.textContent = messages.loadingTitle;
    if (summaryEl) summaryEl.textContent = messages.loadingSummary;
    if (updatedEl) updatedEl.textContent = '';
    if (viewsEl) viewsEl.textContent = '';
  }

  function setEmpty() {
    if (statusEl) statusEl.textContent = '대기 중';
    if (titleEl) titleEl.textContent = messages.emptyTitle;
    if (summaryEl) summaryEl.textContent = messages.emptySummary;
    if (updatedEl) updatedEl.textContent = '';
    if (viewsEl) viewsEl.textContent = '';
  }

  function setError() {
    if (statusEl) statusEl.textContent = '오류';
    if (titleEl) titleEl.textContent = messages.errorTitle;
    if (summaryEl) summaryEl.textContent = messages.errorSummary;
    if (updatedEl) updatedEl.textContent = '';
    if (viewsEl) viewsEl.textContent = '';
    if (card) card.classList.add('is-error');
  }

  function extractSummary(report) {
    if (report.summary) return report.summary;
    if (!report.report_md) return '';
    const chunks = report.report_md
      .split(/\n\n+/)
      .map((block) => block.replace(/[#>*-]/g, '').trim())
      .filter(Boolean);
    return chunks[0] || '';
  }

  function formatUpdated(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      setLoading();
      loadReport();
    });
  }
}
