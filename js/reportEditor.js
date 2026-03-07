import { getSupabaseClient } from './config/supabaseConfig.js';
import { initializeReportEditor } from './reportEditorCore.js';

document.addEventListener('DOMContentLoaded', async () => {
  const supabaseClient = getSupabaseClient();
  const refs = {
    titleInput: document.getElementById('report-title'),
    slugInput: document.getElementById('report-slug'),
    summaryInput: document.getElementById('report-summary'),
    contentInput: document.getElementById('report-content'),
    statusSelect: document.getElementById('report-status'),
    evidenceContainer: document.getElementById('evidence-container'),
    addEvidenceBtn: document.getElementById('add-evidence-btn'),
    saveBtn: document.getElementById('btn-save'),
    previewBtn: document.getElementById('btn-preview'),
    cancelBtn: document.getElementById('btn-cancel'),
    previewModal: document.getElementById('preview-modal'),
    previewBody: document.getElementById('preview-body'),
    previewCloseBtn: document.getElementById('preview-close'),
    statusEl: document.getElementById('editor-status')
  };

  if (!supabaseClient) {
    if (refs.statusEl) {
      refs.statusEl.textContent = 'Supabase 설정이 필요합니다.';
      refs.statusEl.dataset.status = 'error';
      refs.statusEl.hidden = false;
      refs.statusEl.style.display = 'block';
    }
    refs.saveBtn?.setAttribute('disabled', 'true');
    return;
  }

  const editor = initializeReportEditor({
    refs,
    supabaseClient,
    onSaved: (report) => {
      if (!report?.id) return;
      const params = new URLSearchParams(window.location.search);
      params.set('id', report.id);
      window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
    },
    onCancel: () => {
      window.location.href = 'dashboard.html';
    }
  });

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const slug = params.get('slug');
  if (id || slug) {
    await editor.hydrateReport({ id, slug });
  }
});
