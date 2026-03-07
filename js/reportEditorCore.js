import { getReportAdmin, saveReport } from './services/reportAdapter.js';

const DEFAULT_EVIDENCE = [
  {
    name: '국토교통부 실거래가 공개시스템',
    url: 'https://rt.molit.go.kr',
    coverage: '서울 아파트 실거래가'
  }
];

const SAMPLE_TEMPLATE = `## 1. 시장 요약

- 핵심 지역 거래량과 가격 흐름을 요약합니다.

## 2. 수요와 공급

- 수요 변화
- 공급 계획

## 3. 가격 동향

- 핵심지
- 비핵심지

## 4. 체크 포인트

- 금리
- 공급 일정
- 전세 수급
`;

export function initializeReportEditor({
  refs,
  supabaseClient,
  onSaved,
  onCancel,
  previewTitleRenderer
}) {
  let simplemde = null;
  let evidenceSources = cloneValue(DEFAULT_EVIDENCE);
  let editingReport = null;

  bootstrap();

  return {
    resetEditor,
    hydrateReport,
    getEditingReport: () => editingReport
  };

  function bootstrap() {
    if (refs.slugInput) {
      refs.slugInput.addEventListener('blur', () => {
        refs.slugInput.value = sanitizeSlug(refs.slugInput.value);
      });
    }
    refs.addEvidenceBtn?.addEventListener('click', onAddEvidence);
    refs.previewBtn?.addEventListener('click', showPreview);
    refs.saveBtn?.addEventListener('click', onSave);
    refs.cancelBtn?.addEventListener('click', () => {
      if (typeof onCancel === 'function') {
        onCancel({ editingReport });
        return;
      }
      resetEditor();
    });
    refs.previewCloseBtn?.addEventListener('click', closePreview);
    refs.previewModal?.addEventListener('click', (event) => {
      if (event.target === refs.previewModal) {
        closePreview();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && refs.previewModal?.style.display === 'flex') {
        closePreview();
      }
    });
    initializeSimpleMde();
    renderEvidenceSources();
  }

  function initializeSimpleMde() {
    if (!refs.contentInput) return;
    if (window.SimpleMDE) {
      simplemde = new window.SimpleMDE({
        element: refs.contentInput,
        spellChecker: false,
        placeholder: `마크다운 형식으로 리포트를 작성하세요.\n\n${SAMPLE_TEMPLATE}`,
        minHeight: '420px',
        toolbar: [
          'bold',
          'italic',
          'heading',
          '|',
          'quote',
          'unordered-list',
          'ordered-list',
          '|',
          'link',
          'image',
          '|',
          'preview',
          'side-by-side',
          'fullscreen',
          '|',
          'guide'
        ]
      });
      simplemde.value(SAMPLE_TEMPLATE);
      return;
    }

    refs.contentInput.value = SAMPLE_TEMPLATE;
    refs.contentInput.placeholder = '마크다운 형식으로 리포트를 작성하세요.';
  }

  function onAddEvidence() {
    evidenceSources.push({ name: '', url: '', coverage: '' });
    renderEvidenceSources();
  }

  function renderEvidenceSources() {
    if (!refs.evidenceContainer) return;
    if (!evidenceSources.length) {
      evidenceSources = cloneValue(DEFAULT_EVIDENCE);
    }

    refs.evidenceContainer.innerHTML = '';
    evidenceSources.forEach((source, index) => {
      const item = document.createElement('div');
      item.className = 'evidence-item';

      const header = document.createElement('div');
      header.className = 'evidence-item-header';
      header.innerHTML = `<strong>출처 ${index + 1}</strong>`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '삭제';
      removeBtn.addEventListener('click', () => {
        evidenceSources.splice(index, 1);
        renderEvidenceSources();
      });
      header.appendChild(removeBtn);

      item.appendChild(header);
      item.appendChild(createEvidenceInput('출처명', source.name, (value) => updateEvidence(index, 'name', value)));
      item.appendChild(createEvidenceInput('URL', source.url, (value) => updateEvidence(index, 'url', value), 'url'));
      item.appendChild(createEvidenceInput('커버리지', source.coverage, (value) => updateEvidence(index, 'coverage', value)));

      refs.evidenceContainer.appendChild(item);
    });
  }

  function createEvidenceInput(placeholder, value, onChange, type = 'text') {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-group';
    wrapper.style.marginBottom = '0.75rem';
    const input = document.createElement('input');
    input.type = type;
    input.className = 'form-input';
    input.placeholder = placeholder;
    input.value = value || '';
    input.addEventListener('input', (event) => onChange(event.target.value));
    wrapper.appendChild(input);
    return wrapper;
  }

  function updateEvidence(index, field, value) {
    if (!evidenceSources[index]) return;
    evidenceSources[index][field] = value;
  }

  async function hydrateReport({ id, slug } = {}) {
    if (!id && !slug) return null;
    setStatus('리포트 데이터를 불러오는 중입니다.', 'info');
    try {
      const report = await getReportAdmin({ id, slug });
      if (!report) {
        throw new Error('리포트를 찾을 수 없습니다.');
      }
      editingReport = report;
      refs.titleInput.value = report.title || '';
      refs.slugInput.value = report.slug || '';
      refs.summaryInput.value = report.summary || '';
      refs.statusSelect.value = report.status || 'draft';
      setEditorContent(report.report_md || '');
      evidenceSources = Array.isArray(report.evidence_json) && report.evidence_json.length
        ? cloneValue(report.evidence_json)
        : cloneValue(DEFAULT_EVIDENCE);
      renderEvidenceSources();
      setStatus('리포트 데이터를 불러왔습니다.', 'success');
      return report;
    } catch (error) {
      console.error('Report hydrate error', error);
      setStatus(error.message || '리포트를 불러오지 못했습니다.', 'error');
      return null;
    }
  }

  function resetEditor() {
    editingReport = null;
    refs.titleInput.value = '';
    refs.slugInput.value = '';
    refs.summaryInput.value = '';
    refs.statusSelect.value = 'draft';
    setEditorContent(SAMPLE_TEMPLATE);
    evidenceSources = cloneValue(DEFAULT_EVIDENCE);
    renderEvidenceSources();
    setStatus('', 'info');
  }

  async function onSave() {
    try {
      setSavingState(true);
      const payload = buildReportPayload();
      await ensureSlugAvailable(payload.slug, editingReport?.id);
      const savedReport = await saveReport({
        ...payload,
        id: editingReport?.id,
        created_at: editingReport?.created_at
      });
      editingReport = savedReport;
      setStatus('리포트가 저장되었습니다.', 'success');
      if (typeof onSaved === 'function') {
        onSaved(savedReport);
      }
    } catch (error) {
      console.error('Report save error', error);
      setStatus(error.message || '리포트 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingState(false);
    }
  }

  async function ensureSlugAvailable(slug, currentReportId) {
    const existing = await getReportAdmin({ slug });
    if (!existing) return;
    if (currentReportId && existing.id === currentReportId) return;
    throw new Error(`슬러그 "${slug}"는 이미 사용 중입니다.`);
  }

  function buildReportPayload() {
    const title = (refs.titleInput?.value || '').trim();
    const slug = sanitizeSlug(refs.slugInput?.value || '');
    const summary = (refs.summaryInput?.value || '').trim();
    const report_md = getEditorContent().trim();
    const status = refs.statusSelect?.value || 'draft';

    if (!title) throw new Error('리포트 제목을 입력하세요.');
    if (title.length > 200) throw new Error('제목은 200자 이내로 입력하세요.');
    if (!slug) throw new Error('슬러그를 입력하세요.');
    if (slug.length > 100) throw new Error('슬러그는 100자 이내로 입력하세요.');
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('슬러그는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.');
    if (!summary) throw new Error('요약을 입력하세요.');
    if (summary.length > 500) throw new Error('요약은 500자 이내로 입력하세요.');
    if (!report_md) throw new Error('리포트 본문을 입력하세요.');
    if (report_md.length > 50000) throw new Error('본문은 50,000자 이내로 입력하세요.');

    const evidence_json = evidenceSources
      .map((source) => ({
        name: (source.name || '').trim(),
        url: (source.url || '').trim(),
        coverage: (source.coverage || '').trim()
      }))
      .filter((entry) => entry.name || entry.url || entry.coverage);

    return {
      slug,
      title,
      summary,
      report_md,
      evidence_json,
      status,
      metadata: {
        evidenceCount: evidence_json.length,
        lastEditedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };
  }

  function showPreview() {
    if (!refs.previewModal || !refs.previewBody) return;
    const title = refs.titleInput?.value || '무제 리포트';
    const rawHtml = window.marked ? window.marked.parse(getEditorContent()) : getEditorContent();
    const safeTitle = window.DOMPurify ? window.DOMPurify.sanitize(title) : title;
    const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
    const previewTitle = typeof previewTitleRenderer === 'function'
      ? previewTitleRenderer(safeTitle)
      : `<h1 style="font-size:2.5rem;margin-bottom:1rem;color:#111827;">${safeTitle}</h1>`;
    refs.previewBody.innerHTML = `${previewTitle}<div class="lr-report-body">${safeHtml}</div>`;
    refs.previewModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    if (!refs.previewModal) return;
    refs.previewModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function getEditorContent() {
    if (simplemde) return simplemde.value();
    return refs.contentInput?.value || '';
  }

  function setEditorContent(value) {
    if (simplemde) {
      simplemde.value(value);
      return;
    }
    if (refs.contentInput) {
      refs.contentInput.value = value;
    }
  }

  function setSavingState(isSaving) {
    if (!refs.saveBtn) return;
    refs.saveBtn.disabled = isSaving;
    refs.saveBtn.textContent = isSaving ? '저장 중...' : '저장';
  }

  function setStatus(message, status = 'info') {
    if (!refs.statusEl) return;
    refs.statusEl.textContent = message || '';
    refs.statusEl.dataset.status = status;
    refs.statusEl.hidden = !message;
    refs.statusEl.style.display = message ? 'block' : 'none';
  }
}

export function sanitizeSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}
