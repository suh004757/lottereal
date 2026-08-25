import { listPublishedKnowledgeReports } from './services/reportAdapter.js';
import { buildKnowledgeIndex, getOntologySuggestions, searchKnowledge } from './knowledgeSearch.mjs';
import { mountInquiryChat } from './inquiryChat.js';

const WIDGET_STYLESHEET = 'css/knowledge-widget.css';
const state = { index: null, loading: false, lastFocused: null, currentMode: 'knowledge' };

initializeWidget();

function initializeWidget() {
  if (document.getElementById('lr-knowledge-widget')) return;
  ensureStylesheet();
  document.body.classList.add('has-knowledge-widget');

  const root = document.createElement('div');
  root.id = 'lr-knowledge-widget';
  root.className = 'lr-knowledge-widget';
  root.innerHTML = `
    <button class="lr-knowledge-widget__launcher" type="button" aria-haspopup="dialog" aria-expanded="false">
      <span aria-hidden="true">✦</span><strong>자료 · 문의</strong>
    </button>
    <div class="lr-knowledge-widget__backdrop" hidden></div>
    <section class="lr-knowledge-widget__panel" role="dialog" aria-modal="true" aria-labelledby="lr-knowledge-widget-title" hidden>
      <header>
        <div>
          <p>롯데부동산 안내 데스크</p>
          <h2 id="lr-knowledge-widget-title">자료를 찾거나 문의를 남겨보세요</h2>
        </div>
        <button class="lr-knowledge-widget__close" type="button" aria-label="자료·문의 창 닫기">×</button>
      </header>
      <nav class="lr-knowledge-widget__modes" role="tablist" aria-label="자료 찾기와 문의 접수">
        <button type="button" role="tab" data-widget-mode="knowledge" aria-selected="true">자료 찾기</button>
        <button type="button" role="tab" data-widget-mode="inquiry" aria-selected="false">문의 접수</button>
      </nav>
      <div class="lr-knowledge-widget__body" data-widget-view="knowledge">
        <form class="lr-knowledge-widget__form" role="search">
          <label for="lr-knowledge-widget-input">질문 입력</label>
          <div>
            <input id="lr-knowledge-widget-input" type="search" minlength="2" maxlength="160" autocomplete="off" placeholder="예: 보증금 못 받고 이사해도 되나요?">
            <button type="submit">찾기</button>
          </div>
          <small>이름·전화번호·상세 주소는 입력하지 마세요.</small>
        </form>
        <div class="lr-knowledge-widget__suggestions" aria-label="질문 예시"></div>
        <p class="lr-knowledge-widget__status" role="status">버튼을 누르면 공개 자료를 불러옵니다.</p>
        <div class="lr-knowledge-widget__results" aria-live="polite"></div>
      </div>
      <div class="lr-knowledge-widget__body" data-widget-view="inquiry" hidden>
        <div data-inquiry-chat></div>
      </div>
      <footer>
        <a href="knowledge.html">전체 자료검색 페이지 열기</a>
        <a href="contact.html#inquiry-options">전체 문의 양식</a>
        <span>자료 질문은 저장 안 함 · 문의만 안전하게 접수</span>
      </footer>
    </section>
  `;
  document.body.appendChild(root);

  const launcher = root.querySelector('.lr-knowledge-widget__launcher');
  const panel = root.querySelector('.lr-knowledge-widget__panel');
  const backdrop = root.querySelector('.lr-knowledge-widget__backdrop');
  const closeButton = root.querySelector('.lr-knowledge-widget__close');
  const form = root.querySelector('.lr-knowledge-widget__form');
  const input = root.querySelector('#lr-knowledge-widget-input');
  const status = root.querySelector('.lr-knowledge-widget__status');
  const results = root.querySelector('.lr-knowledge-widget__results');
  const suggestions = root.querySelector('.lr-knowledge-widget__suggestions');
  const modeButtons = [...root.querySelectorAll('[role="tab"][data-widget-mode]')];
  const modeViews = [...root.querySelectorAll('[data-widget-view]')];
  const inquiryChat = root.querySelector('[data-inquiry-chat]');

  renderSuggestions(suggestions, input, runSearch);
  mountInquiryChat(inquiryChat);
  launcher.addEventListener('click', () => openPanel('knowledge'));
  closeButton.addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  modeButtons.forEach((button) => button.addEventListener('click', () => switchMode(button.dataset.widgetMode)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(input.value);
  });
  results.addEventListener('click', (event) => {
    const questionButton = event.target.closest('button[data-question]');
    if (questionButton) {
      input.value = questionButton.dataset.question || '';
      runSearch(input.value);
      return;
    }
    const link = event.target.closest('a[data-widget-result]');
    if (!link) return;
    sendAnalytics('knowledge_widget_result_click', {
      result_position: Number(link.dataset.position || 0),
      result_type: link.dataset.type || 'report'
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
    if (event.key === 'Tab' && !panel.hidden) {
      const focusableElements = [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        .filter((element) => !element.hidden && !element.closest('[hidden]'));
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  attachMobileAction(openPanel);
  window.addEventListener('lottereal:open-inquiry', (event) => {
    inquiryChat.dispatchEvent(new CustomEvent('inquiry-chat-context', { detail: event.detail || {} }));
    openPanel('inquiry');
  });

  async function openPanel(mode = 'knowledge') {
    state.lastFocused = document.activeElement;
    panel.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => root.classList.add('is-open'));
    launcher.setAttribute('aria-expanded', 'true');
    document.body.classList.add('knowledge-widget-open');
    switchMode(mode);
    sendAnalytics('knowledge_widget_open', { source_path: window.location.pathname, widget_mode: state.currentMode });
    if (state.currentMode === 'knowledge' && !state.index && !state.loading) await loadIndex(status, results);
    if (state.currentMode === 'knowledge') input.focus();
  }

  function switchMode(mode) {
    state.currentMode = mode === 'inquiry' ? 'inquiry' : 'knowledge';
    modeButtons.forEach((button) => {
      const selected = button.dataset.widgetMode === state.currentMode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    modeViews.forEach((view) => {
      view.hidden = view.dataset.widgetView !== state.currentMode;
    });
    if (state.currentMode === 'knowledge' && !state.index && !state.loading) loadIndex(status, results);
    const target = state.currentMode === 'knowledge'
      ? input
      : inquiryChat.querySelector('button, input, textarea');
    window.setTimeout(() => target?.focus(), 0);
  }

  function closePanel() {
    root.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('knowledge-widget-open');
    window.setTimeout(() => {
      panel.hidden = true;
      backdrop.hidden = true;
    }, 180);
    if (state.lastFocused?.focus) state.lastFocused.focus();
  }

  function runSearch(rawQuery) {
    const query = String(rawQuery || '').trim().slice(0, 160);
    if (query.length < 2) {
      status.textContent = '두 글자 이상으로 핵심 상황을 적어주세요.';
      status.classList.add('is-error');
      input.focus();
      return;
    }
    if (!state.index) {
      status.textContent = '자료를 불러오는 중입니다. 잠시 후 다시 눌러주세요.';
      return;
    }

    const result = searchKnowledge(state.index, query, { limit: 3 });
    const matches = result.matches.slice(0, 3);
    status.classList.toggle('is-error', matches.length === 0);
    status.textContent = matches.length
      ? `관련 자료 ${matches.length}건을 찾았습니다.`
      : '가까운 공개 자료를 찾지 못했습니다. 표현을 바꿔보세요.';
    results.innerHTML = matches.length ? renderMatches(matches) : renderEmpty();
    sendAnalytics('knowledge_widget_search', {
      query_length: query.length,
      result_count: matches.length,
      topic_labels: result.detectedLabels.map((item) => item.id).slice(0, 6).join(',') || 'unclassified'
    });
  }
}

async function loadIndex(status, results) {
  state.loading = true;
  status.classList.remove('is-error');
  status.textContent = '공개 자료를 불러오는 중입니다.';
  try {
    const reports = await listPublishedKnowledgeReports({ batchSize: 200 });
    state.index = buildKnowledgeIndex(reports);
    status.textContent = `공개 자료 ${state.index.documents.length.toLocaleString()}건에서 찾아볼 수 있습니다.`;
  } catch (error) {
    console.error('Knowledge widget load failed:', error);
    status.textContent = '자료 연결이 지연되고 있습니다. 전체 자료검색 페이지를 이용해 주세요.';
    status.classList.add('is-error');
    results.innerHTML = '<a class="lr-knowledge-widget__fallback" href="knowledge.html">전체 자료검색 열기</a>';
  } finally {
    state.loading = false;
  }
}

function renderSuggestions(container, input, runSearch) {
  container.innerHTML = getOntologySuggestions().slice(0, 3).map((question) => `
    <button type="button" data-question="${escapeHtml(question)}">${escapeHtml(shortenQuestion(question))}</button>
  `).join('');
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-question]');
    if (!button) return;
    input.value = button.dataset.question || '';
    runSearch(input.value);
  });
}

function renderMatches(matches) {
  return `<div class="lr-knowledge-widget__result-list">${matches.map((match, index) => {
    const passage = match.passages[0];
    const type = match.contentType === 'dispute_case' ? '계약·분쟁' : '시장·정책';
    return `
      <article>
        <span>${escapeHtml(type)}</span>
        <h3>${escapeHtml(match.title)}</h3>
        ${passage ? `<p><strong>${escapeHtml(passage.heading)}</strong> ${escapeHtml(passage.text)}</p>` : `<p>${escapeHtml(match.summary)}</p>`}
        <a href="report.html?slug=${encodeURIComponent(match.slug)}" data-widget-result data-position="${index + 1}" data-type="report">원문과 출처 보기</a>
      </article>
    `;
  }).join('')}</div>`;
}

function renderEmpty() {
  return `
    <div class="lr-knowledge-widget__empty">
      <p>핵심 단어를 짧게 바꿔보세요.</p>
      <div><button type="button" data-question="누수 수리 책임">누수 수리 책임</button><button type="button" data-question="송파 금리 대출">송파 금리 대출</button></div>
      <a href="knowledge.html">전체 자료에서 자세히 찾기</a>
    </div>
  `;
}

function attachMobileAction(openPanel) {
  const actionbar = document.querySelector('.lr-mobile-actionbar');
  if (!actionbar) return;
  actionbar.classList.add('lr-mobile-actionbar--with-knowledge');

  const inquiryLink = actionbar.querySelector('a[href*="contact.html#inquiry-options"]');
  if (inquiryLink) {
    inquiryLink.setAttribute('aria-haspopup', 'dialog');
    inquiryLink.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel('inquiry');
    });
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lr-mobile-actionbar__knowledge';
  button.innerHTML = '<span aria-hidden="true">✦</span><strong>자료·문의</strong>';
  button.addEventListener('click', () => openPanel('knowledge'));
  actionbar.appendChild(button);
}

function ensureStylesheet() {
  if (document.querySelector(`link[href="${WIDGET_STYLESHEET}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = WIDGET_STYLESHEET;
  document.head.appendChild(link);
}

function shortenQuestion(value) {
  return String(value).replace(/\?$/, '').replace('어떤 영향을 주나요', '영향').slice(0, 24);
}

function sendAnalytics(name, params) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, { page_path: window.location.pathname, ...params });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
