import { listPublishedKnowledgeReports } from './services/reportAdapter.js';
import {
  buildKnowledgeIndex,
  getOntologySuggestions,
  searchKnowledge
} from './knowledgeSearch.mjs';

const state = {
  index: null,
  loading: true
};

const form = document.getElementById('knowledge-search-form');
const input = document.getElementById('knowledge-search-input');
const statusNode = document.getElementById('knowledge-search-status');
const resultsNode = document.getElementById('knowledge-search-results');
const suggestionNode = document.getElementById('knowledge-suggestion-list');

document.addEventListener('DOMContentLoaded', initializeKnowledgePage);

async function initializeKnowledgePage() {
  renderSuggestions();
  bindEvents();
  setBusy(true);

  try {
    const reports = await listPublishedKnowledgeReports({ limit: 1000 });
    state.index = buildKnowledgeIndex(reports);
    state.loading = false;
    setBusy(false);
    setStatus(`현재 공개 자료 ${state.index.documents.length.toLocaleString()}건에서 찾아볼 수 있습니다.`);
  } catch (error) {
    console.error('Failed to load knowledge reports:', error);
    state.loading = false;
    setBusy(false);
    setStatus('자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.', true);
    renderLoadError();
  }
}

function bindEvents() {
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(input?.value || '');
  });

  suggestionNode?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-question]');
    if (!button) return;
    const question = button.dataset.question || '';
    if (input) input.value = question;
    runSearch(question);
  });

  resultsNode?.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-knowledge-result]');
    if (!link) return;
    sendAnalytics('knowledge_result_click', {
      result_type: link.dataset.resultType || 'report',
      result_position: Number(link.dataset.resultPosition || 0)
    });
  });
}

function runSearch(rawQuery) {
  const query = String(rawQuery || '').trim().slice(0, 160);
  if (query.length < 2) {
    input?.focus();
    setStatus('두 글자 이상으로 궁금한 상황을 적어주세요.', true);
    return;
  }
  if (state.loading || !state.index) {
    setStatus('자료를 불러온 뒤 다시 검색해 주세요.', true);
    return;
  }

  setBusy(true);
  const result = searchKnowledge(state.index, query, { limit: 5 });
  renderSearchResult(result);
  setBusy(false);
  setStatus(result.matches.length
    ? `관련 자료 ${result.matches.length}건을 찾았습니다.`
    : '가까운 공개 자료를 찾지 못했습니다. 다른 표현으로 다시 검색해 보세요.',
  result.matches.length === 0);

  sendAnalytics('knowledge_search_submit', {
    query_length: query.length,
    result_count: result.matches.length,
    indexed_document_count: result.indexedDocumentCount,
    topic_labels: result.detectedLabels.map((item) => item.id).slice(0, 8).join(',') || 'unclassified'
  });
}

function renderSuggestions() {
  if (!suggestionNode) return;
  suggestionNode.innerHTML = getOntologySuggestions().slice(0, 5).map((question) => `
    <button type="button" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>
  `).join('');
}

function renderSearchResult(result) {
  if (!resultsNode) return;
  if (!result.matches.length) {
    resultsNode.innerHTML = `
      <div class="lr-knowledge-empty">
        <p class="lr-kicker">검색 결과 없음</p>
        <h2>현재 공개 자료에서는 가까운 내용을 찾지 못했습니다</h2>
        <p>사람 이름, 전화번호, 상세 주소는 빼고 핵심 주제를 짧게 바꿔보세요. 예: “복비 언제 내나요?”, “누수 수리 책임”, “송파 금리 영향”.</p>
        <div class="lr-actions">
          <a class="lr-btn lr-btn--ghost" href="report.html">전체 시장 리포트</a>
          <a class="lr-btn lr-btn--ghost" href="disputes.html">계약·분쟁 사례</a>
        </div>
      </div>
    `;
    return;
  }

  const topMatches = result.matches.slice(0, 3);
  const passages = topMatches.flatMap((match, matchIndex) =>
    match.passages.slice(0, matchIndex === 0 ? 2 : 1).map((passage) => ({ ...passage, match, matchIndex }))
  ).slice(0, 4);

  resultsNode.innerHTML = `
    <article class="lr-knowledge-answer">
      <header class="lr-knowledge-answer__header">
        <p class="lr-kicker">공개 자료 검색 결과</p>
        <h2>질문과 가까운 내용 ${result.matches.length}건을 찾았습니다</h2>
        <p>새 문장을 만들어 단정하지 않고, 현재 공개된 자료에서 관련 문단을 골랐습니다.</p>
        ${renderDetectedLabels(result.detectedLabels)}
      </header>

      <section class="lr-knowledge-answer__section">
        <h3>먼저 확인할 내용</h3>
        <div class="lr-knowledge-passages">
          ${passages.map(({ heading, text, match, matchIndex }) => `
            <blockquote>
              <p class="lr-knowledge-passage__source">${escapeHtml(match.title)}</p>
              <h4>${escapeHtml(heading)}</h4>
              <p>${escapeHtml(text)}</p>
              <a href="report.html?slug=${encodeURIComponent(match.slug)}" data-knowledge-result data-result-type="passage" data-result-position="${matchIndex + 1}">원문에서 확인하기</a>
            </blockquote>
          `).join('')}
        </div>
      </section>

      <section class="lr-knowledge-answer__section">
        <h3>관련 사례·리포트</h3>
        <div class="lr-knowledge-report-list">
          ${result.matches.map((match, index) => renderReportMatch(match, index)).join('')}
        </div>
      </section>

      <section class="lr-knowledge-answer__section">
        <h3>공식 근거와 자료</h3>
        ${result.sources.length ? `
          <ul class="lr-knowledge-source-list">
            ${result.sources.map((source, index) => `
              <li>
                <a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer" data-knowledge-result data-result-type="source" data-result-position="${index + 1}">${escapeHtml(source.name)}</a>
                ${source.coverage ? `<p>${escapeHtml(source.coverage)}</p>` : ''}
                ${source.checkedAt ? `<span>확인일 ${escapeHtml(source.checkedAt)}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        ` : '<p class="lr-text">연결된 공식 출처는 각 원문 리포트에서 확인할 수 있습니다.</p>'}
      </section>

      <aside class="lr-knowledge-answer__notice">
        이 결과는 일반 정보이며 개별 법률 자문이나 매수·매도 권유가 아닙니다. 중요한 판단 전에는 계약서와 실제 사실관계를 별도로 확인하세요.
      </aside>
    </article>
  `;
}

function renderDetectedLabels(labels) {
  if (!labels.length) return '';
  return `<div class="lr-knowledge-labels" aria-label="찾은 주제">${labels.slice(0, 8).map((label) => `<span>${escapeHtml(label.label)}</span>`).join('')}</div>`;
}

function renderReportMatch(match, index) {
  const label = match.contentType === 'dispute_case' ? '계약·분쟁 사례' : match.contentType.includes('policy') ? '정책 리포트' : '시장 리포트';
  return `
    <article>
      <div>
        <span class="lr-knowledge-type">${escapeHtml(label)}</span>
        <h4>${escapeHtml(match.title)}</h4>
        <p>${escapeHtml(match.summary)}</p>
        <small>${formatDate(match.updatedAt)}</small>
      </div>
      <a href="report.html?slug=${encodeURIComponent(match.slug)}" data-knowledge-result data-result-type="report" data-result-position="${index + 1}">자세히 보기</a>
    </article>
  `;
}

function renderLoadError() {
  if (!resultsNode) return;
  resultsNode.innerHTML = `
    <div class="lr-knowledge-empty">
      <p class="lr-kicker">연결 지연</p>
      <h2>자료를 불러오지 못했습니다</h2>
      <p>새로고침하거나 시장 리포트와 계약·분쟁 사례 메뉴에서 직접 확인해 주세요.</p>
    </div>
  `;
}

function setBusy(isBusy) {
  resultsNode?.setAttribute('aria-busy', String(Boolean(isBusy)));
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = Boolean(isBusy);
}

function setStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.classList.toggle('is-error', Boolean(isError));
}

function sendAnalytics(name, params) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, {
    page_path: window.location.pathname,
    ...params
  });
}

function safeUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '기준일 확인';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
