/**
 * ============================================
 * Market Report Editor
 * ============================================
 * 
 * File Path: js/reportEditor.js
 * HTML Page: admin/report-editor.html
 * 
 * Main Features:
 * 1. Initialize SimpleMDE markdown editor
 * 2. Load existing reports from Supabase (hydration)
 * 3. Save/update reports (INSERT/UPDATE)
 * 4. Markdown preview (XSS protection with DOMPurify)
 * 5. Evidence source management
 * 6. Slug uniqueness validation
 * 
 * Security Features (Applied 2025-12-30):
 * - HTML sanitization using DOMPurify
 * - Slug validation (lowercase letters + numbers + hyphens only)
 * - Input length limits (title 200 chars, summary 500 chars, content 50,000 chars)
 * - Slug uniqueness check (when creating new reports)
 * 
 * Data Flow:
 * 1. Check URL parameters (?id= or ?slug=)
 * 2. Load data from Supabase if exists (hydrateExistingReport)
 * 3. Form input → buildReportPayload() → validation
 * 4. Supabase INSERT or UPDATE
 * 5. Add id to URL on success (persistQueryParams)
 */

import { getSupabaseClient } from './config/supabaseConfig.js';

// ============================================
// Constants
// ============================================

/**
 * Sample markdown template
 * Default structure shown when user first opens the editor
 */
const SAMPLE_TEMPLATE = `## 1. Macro Environment

### 금리와 정책 동향
- 최근 3개월간 기준금리는 동결 기조를 유지했습니다.
- 유동성은 2024년 4분기 대비 소폭 개선되었습니다.

### 수요 신호
- 주택구매심리지수는 95~98 구간에서 횡보 중입니다.
- 비핵심 지역의 문의 증가 폭이 더 큽니다.

---

## 2. 수요 & 공급

### 거래량
- 서울 전체 거래량은 전월 대비 +3.2% 증가했습니다.
- 강남3구 거래 비중은 전체의 약 18%입니다.

### 공급 계획
- 2025년 1분기 예정 분양 물량은 약 8,200세대입니다.
- 재건축·재개발 착공은 핵심 택지를 중심으로 제한적입니다.

---

## 3. 가격 동향

### 핵심 지역
- 강남, 송파, 잠실의 매매 가격은 전월 대비 ±0.5% 이내에서 보합세입니다.
- 한강 조망 단지 위주로 호가 상향 조정이 관찰됩니다.

### 비핵심 지역
- 수도권 외곽은 거래 부진으로 약 -0.7% 조정이 이어집니다.
- 전세 → 월세 전환 수요가 늘어나며 월세가 강세입니다.

---

## 4. 리스크 관찰 (Risk Watchlist)

### 단기 리스크
1. 금융 규제/DSR 추가 강화 가능성
2. 주요 예정지 인허가 지연

### 중장기 리스크
1. 인구구조 변화에 따른 수요 축소
2. 금리 재인상 시 자금 조달 부담 확대

---

## 5. 체크 포인트 (What to Watch Next)
- 한국은행 통화정책 방향성
- 서울/수도권 분양 물량 소화 속도
- 전세→월세 전환 속도와 역전세 이슈

---

## 면책
This report is a reference analysis based on historical data and is not investment advice.`;

/**
 * Default evidence source template
 * Default sources automatically added when creating new reports
 */
const DEFAULT_EVIDENCE = [
  {
    name: '국토교통부 실거래가 공개시스템',
    url: 'https://rt.molit.go.kr',
    coverage: '서울 전역 아파트 실거래 데이터'
  }
];

// ============================================
// Global State Variables
// ============================================

/**
 * SimpleMDE editor instance
 * Initialized in initializeEditor()
 */
let simplemde;

/**
 * Evidence sources array
 * Can be added/removed by user
 */
let evidenceSources = cloneEvidence(DEFAULT_EVIDENCE);

/**
 * Currently editing report object
 * null: New report mode
 * object: Edit existing report mode (includes id)
 */
let editingReport = null;

/**
 * Supabase client instance
 * Initialized via getSupabaseClient()
 */
let supabaseClient = null;

/**
 * DOM element references object
 * Pre-cache frequently used DOM elements for performance
 */
const refs = {
  titleInput: null,
  slugInput: null,
  summaryInput: null,
  statusSelect: null,
  addEvidenceBtn: null,
  saveBtn: null,
  previewBtn: null,
  cancelBtn: null,
  previewModal: null,
  previewBody: null,
  statusEl: null
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize editor when DOM is loaded
 * { once: true }: Execute event listener only once (prevent memory leak)
 */
document.addEventListener('DOMContentLoaded', () => initEditorPage(), { once: true });

/**
 * Editor page initialization function
 * 
 * Execution order:
 * 1. Store DOM element references
 * 2. Initialize Supabase client
 * 3. Check Supabase connection (early exit if unavailable)
 * 4. Initialize SimpleMDE editor
 * 5. Bind events
 * 6. Render evidence sources UI
 * 7. Load existing report (if URL parameters exist)
 * 
 * Security improvements (2025-12-30):
 * - Changed to async/await to wait for hydrateExistingReport() completion
 * - Check Supabase connection first to prevent unnecessary initialization
 */
async function initEditorPage() {
  // 1. Store DOM element references
  refs.titleInput = document.getElementById('report-title');
  refs.slugInput = document.getElementById('report-slug');
  refs.summaryInput = document.getElementById('report-summary');
  refs.statusSelect = document.getElementById('report-status');
  refs.addEvidenceBtn = document.getElementById('add-evidence-btn');
  refs.saveBtn = document.getElementById('btn-save');
  refs.previewBtn = document.getElementById('btn-preview');
  refs.cancelBtn = document.getElementById('btn-cancel');
  refs.previewModal = document.getElementById('preview-modal');
  refs.previewBody = document.getElementById('preview-body');
  refs.statusEl = document.getElementById('editor-status');

  // 2. Initialize Supabase client
  supabaseClient = getSupabaseClient();

  // 3. Check Supabase connection (early exit)
  if (!supabaseClient) {
    setStatus('Supabase 설정이 필요합니다. appConfig를 확인하세요.', 'error');
    refs.saveBtn?.setAttribute('disabled', 'true');
    return; // Stop here if no connection
  }

  // 4-6. Initialize editor and UI
  initializeEditor();
  bindEvents();
  renderEvidenceSources();

  // 7. Load existing report (wait for async completion)
  await hydrateExistingReport();
}

/**
 * SimpleMDE 마크다운 에디터 초기화
 * 
 * 설정:
 * - spellChecker: false (맞춤법 검사 비활성화)
 * - minHeight: 500px (최소 높이)
 * - toolbar: 볼드, 이탤릭, 헤딩, 인용, 리스트, 링크, 이미지, 미리보기 등
 */
function initializeEditor() {
  if (!window.SimpleMDE) {
    setStatus('에디터 라이브러리가 로드되지 않았습니다.', 'error');
    return;
  }
  simplemde = new window.SimpleMDE({
    element: document.getElementById('report-content'),
    spellChecker: false,
    placeholder: '마크다운 형식으로 리포트를 작성하세요...\n\n' + SAMPLE_TEMPLATE,
    minHeight: '500px',
    toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide']
  });
  simplemde.value(SAMPLE_TEMPLATE);
}

function bindEvents() {
  refs.addEvidenceBtn?.addEventListener('click', () => {
    evidenceSources.push({ name: '', url: '', coverage: '' });
    renderEvidenceSources();
  });
  refs.previewBtn?.addEventListener('click', showPreview);
  refs.saveBtn?.addEventListener('click', saveReport);
  refs.cancelBtn?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
  document.getElementById('preview-close')?.addEventListener('click', closePreview);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && refs.previewModal?.style.display === 'flex') {
      closePreview();
    }
  });
  refs.slugInput?.addEventListener('blur', () => {
    refs.slugInput.value = sanitizeSlug(refs.slugInput.value);
  });
}

function renderEvidenceSources() {
  const container = document.getElementById('evidence-container');
  if (!container) return;
  if (!evidenceSources.length) {
    evidenceSources.push({ name: '', url: '', coverage: '' });
  }
  container.innerHTML = '';
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

    const nameInput = createEvidenceInput('출처 이름', source.name, (value) => updateEvidence(index, 'name', value));
    const urlInput = createEvidenceInput('URL', source.url, (value) => updateEvidence(index, 'url', value), 'url');
    const coverageInput = createEvidenceInput('데이터 범위 (예: 서울 전역 아파트)', source.coverage, (value) => updateEvidence(index, 'coverage', value));

    item.appendChild(header);
    item.appendChild(nameInput);
    item.appendChild(urlInput);
    item.appendChild(coverageInput);
    container.appendChild(item);
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
  evidenceSources[index][field] = value;
}

function showPreview() {
  if (!refs.previewModal || !refs.previewBody) return;
  const title = refs.titleInput?.value || '무제 리포트';
  const content = simplemde ? simplemde.value() : '';
  const rawHtml = window.marked ? window.marked.parse(content) : content;

  // ✅ Sanitize HTML to prevent XSS
  const safeTitle = window.DOMPurify ? window.DOMPurify.sanitize(title) : title;
  const safeHtml = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;

  refs.previewBody.innerHTML = `<h1 style="font-size:2.5rem;margin-bottom:1rem;color:#111827;">${safeTitle}</h1><div class="lr-report-body">${safeHtml}</div>`;
  refs.previewModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  if (!refs.previewModal) return;
  refs.previewModal.style.display = 'none';
  document.body.style.overflow = '';
}

async function hydrateExistingReport() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const slug = params.get('slug');
  if (!id && !slug) return;
  if (!supabaseClient) return;
  setStatus('기존 리포트를 불러오는 중입니다...', 'info');
  try {
    let query = supabaseClient.from('market_reports').select('*').limit(1);
    query = id ? query.eq('id', id) : query.eq('slug', slug);
    const { data, error } = await query.single();
    if (error || !data) throw new Error('리포트를 찾을 수 없습니다.');
    editingReport = data;
    refs.titleInput.value = data.title || '';
    refs.slugInput.value = data.slug || '';
    refs.summaryInput.value = data.summary || '';
    refs.statusSelect.value = data.status || 'draft';
    if (simplemde && data.report_md) {
      simplemde.value(data.report_md);
    }
    evidenceSources = Array.isArray(data.evidence_json) && data.evidence_json.length
      ? data.evidence_json
      : cloneEvidence(DEFAULT_EVIDENCE);
    renderEvidenceSources();
    setStatus('리포트 데이터를 불러왔습니다.', 'success');
  } catch (err) {
    console.error('Report load error', err);
    setStatus(err.message || '리포트를 불러오지 못했습니다.', 'error');
  }
}

function sanitizeSlug(value = '') {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildReportPayload() {
  const title = (refs.titleInput?.value || '').trim();
  const slug = sanitizeSlug(refs.slugInput?.value || '');
  const summary = (refs.summaryInput?.value || '').trim();
  const content = simplemde ? simplemde.value().trim() : '';
  const status = refs.statusSelect?.value || 'draft';

  // ✅ Enhanced validation
  if (!title) throw new Error('리포트 제목을 입력하세요.');
  if (title.length > 200) throw new Error('제목은 200자 이내로 입력하세요.');

  if (!slug) throw new Error('유효한 슬러그를 입력하세요.');
  if (slug.length > 100) throw new Error('슬러그는 100자 이내로 입력하세요.');
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('슬러그는 영문 소문자, 숫자, 하이픈(-)만 사용 가능합니다.');

  if (!summary) throw new Error('요약을 입력하세요.');
  if (summary.length > 500) throw new Error('요약은 500자 이내로 입력하세요.');

  if (!content) throw new Error('본문 내용을 작성하세요.');
  if (content.length > 50000) throw new Error('본문은 50,000자 이내로 입력하세요.');

  const cleanedEvidence = evidenceSources
    .map((source) => ({
      name: (source.name || '').trim(),
      url: (source.url || '').trim(),
      coverage: (source.coverage || '').trim()
    }))
    .filter((entry) => entry.name || entry.url || entry.coverage);

  return {
    title,
    slug,
    summary,
    report_md: content,
    evidence_json: cleanedEvidence,
    status,
    metadata: {
      evidenceCount: cleanedEvidence.length,
      lastEditedAt: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };
}

async function saveReport() {
  if (!supabaseClient) {
    setStatus('Supabase 설정이 필요합니다. appConfig를 확인하세요.', 'error');
    return;
  }
  try {
    const payload = buildReportPayload();
    setSavingState(true);

    // ✅ Check slug uniqueness for new reports
    if (!editingReport?.id) {
      const { data: existing } = await supabaseClient
        .from('market_reports')
        .select('id')
        .eq('slug', payload.slug)
        .single();

      if (existing) {
        throw new Error(`슬러그 "${payload.slug}"는 이미 사용 중입니다. 다른 슬러그를 입력하세요.`);
      }
    }

    setStatus(editingReport ? '리포트를 업데이트하는 중입니다...' : '새 리포트를 저장하는 중입니다...', 'info');
    let response;
    if (editingReport?.id) {
      response = await supabaseClient.from('market_reports').update(payload).eq('id', editingReport.id).select().single();
    } else {
      response = await supabaseClient
        .from('market_reports')
        .insert([{ ...payload, created_at: new Date().toISOString(), view_count: 0 }])
        .select()
        .single();
    }
    if (response.error) throw response.error;
    editingReport = response.data;
    persistQueryParams(editingReport);
    setStatus('리포트가 성공적으로 저장되었습니다.', 'success');
  } catch (err) {
    console.error('Report save error', err);
    setStatus(err.message || '리포트 저장 중 오류가 발생했습니다.', 'error');
  } finally {
    setSavingState(false);
  }
}

function persistQueryParams(report) {
  if (!report?.id) return;
  const params = new URLSearchParams(window.location.search);
  params.set('id', report.id);
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
}

function setSavingState(isSaving) {
  if (!refs.saveBtn) return;
  refs.saveBtn.disabled = isSaving;
  refs.saveBtn.textContent = isSaving ? '저장 중...' : '저장 및 발행';
}

function setStatus(message, status = 'info') {
  if (!refs.statusEl) return;
  refs.statusEl.textContent = message || '';
  refs.statusEl.dataset.status = status;
  refs.statusEl.hidden = !message;
}

function cloneEvidence(value) {
  return JSON.parse(JSON.stringify(value));
}
