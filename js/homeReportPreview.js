import { getLatestReport } from './services/reportAdapter.js';

const section = document.querySelector('[data-report-section]');
if (section) {
  const card = section.querySelector('[data-report-card]');
  const titleEl = section.querySelector('[data-report-title]');

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
    if (statusEl) statusEl.textContent = '최신';
    if (titleEl) titleEl.textContent = report.title || '제목 없음';
    if (summaryEl) summaryEl.textContent = extractSummary(report);
    if (updatedEl) updatedEl.textContent = formatUpdated(report.updated_at);
    if (viewsEl) viewsEl.textContent = `조회수 ${Number(report.view_count || 0).toLocaleString()}회`;
    if (card) card.classList.remove('is-error');
  }

  function setLoading() {
    if (statusEl) statusEl.textContent = '로딩 중';
    if (titleEl) titleEl.textContent = messages.loadingTitle;
    if (summaryEl) summaryEl.textContent = messages.loadingSummary;
    if (updatedEl) updatedEl.textContent = '';
    if (viewsEl) viewsEl.textContent = '';
  }

  function setEmpty() {
    if (statusEl) statusEl.textContent = '공백 상태';
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
      .map((block) => block.replace(/[#>*`-]/g, '').trim())
      .filter(Boolean);
    return chunks[0] || '';
  }

  function formatUpdated(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
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

  init();
}
