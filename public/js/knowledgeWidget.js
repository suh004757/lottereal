import { listPublishedKnowledgeReports } from './services/reportAdapter.js';
import { buildKnowledgeIndex, getOntologySuggestions, searchKnowledge } from './knowledgeSearch.mjs';
import { createInputModalityTracker, INQUIRY_FOCUSABLE_SELECTOR, mountInquiryChat } from './inquiryChat.js';
import { INTERNATIONAL_RENTAL_ISSUES, getInternationalRentalSuggestions, searchInternationalRentalSafety } from './internationalRentalSafety.mjs';
import { reportStaticHref } from './utils/reportUrls.mjs';

const WIDGET_STYLESHEET = 'css/knowledge-widget.css';
const IS_ENGLISH = document.documentElement.lang.toLowerCase().startsWith('en');
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
      <span aria-hidden="true">✦</span><strong>${IS_ENGLISH ? 'Safety · contact' : '자료 · 문의'}</strong>
    </button>
    <div class="lr-knowledge-widget__backdrop" hidden></div>
    <section class="lr-knowledge-widget__panel" role="dialog" aria-modal="true" aria-labelledby="lr-knowledge-widget-title" hidden>
      <header>
        <div>
          <p>${IS_ENGLISH ? 'Rental safety' : '롯데부동산 안내 데스크'}</p>
          <h2 id="lr-knowledge-widget-title">${IS_ENGLISH ? 'Check common issues or send an inquiry' : '자료를 찾거나 문의를 남겨보세요'}</h2>
        </div>
        <button class="lr-knowledge-widget__close" type="button" aria-label="${IS_ENGLISH ? 'Close rental safety and inquiry panel' : '자료·문의 창 닫기'}">×</button>
      </header>
      <nav class="lr-knowledge-widget__modes" role="tablist" aria-label="${IS_ENGLISH ? 'Rental safety and guided inquiry' : '자료 찾기와 문의 접수'}">
        <button type="button" role="tab" data-widget-mode="knowledge" aria-selected="true">${IS_ENGLISH ? 'Common issues' : '자료 찾기'}</button>
        <button type="button" role="tab" data-widget-mode="inquiry" aria-selected="false">${IS_ENGLISH ? 'Send an inquiry' : '문의 접수'}</button>
      </nav>
      <div class="lr-knowledge-widget__body" data-widget-view="knowledge">
        <form class="lr-knowledge-widget__form" role="search">
          <label for="lr-knowledge-widget-input">${IS_ENGLISH ? 'Describe the issue' : '질문 입력'}</label>
          <div>
            <input id="lr-knowledge-widget-input" type="search" minlength="2" maxlength="160" autocomplete="off" placeholder="${IS_ENGLISH ? 'Example: My deposit has not been returned' : '예: 보증금 못 받고 이사해도 되나요?'}">
            <button type="submit">${IS_ENGLISH ? 'Check' : '찾기'}</button>
          </div>
          <small>${IS_ENGLISH ? 'Do not enter names, phone numbers or a full address here.' : '이름·전화번호·상세 주소는 입력하지 마세요.'}</small>
        </form>
        <div class="lr-knowledge-widget__suggestions" aria-label="${IS_ENGLISH ? 'Issue examples' : '질문 예시'}"></div>
        <p class="lr-knowledge-widget__status" role="status">${IS_ENGLISH ? 'Choose an example or describe a common rental issue.' : '버튼을 누르면 공개 자료를 불러옵니다.'}</p>
        <div class="lr-knowledge-widget__results" aria-live="polite"></div>
      </div>
      <div class="lr-knowledge-widget__body" data-widget-view="inquiry" hidden>
        <div data-inquiry-chat></div>
      </div>
      <footer>
        <a href="${IS_ENGLISH ? 'EN.html#renting' : 'knowledge.html'}">${IS_ENGLISH ? 'Rental guide on this page' : '전체 자료검색 페이지 열기'}</a>
        <a href="contact.html#inquiry-options">${IS_ENGLISH ? 'Full contact form' : '전체 문의 양식'}</a>
        <span>${IS_ENGLISH ? 'Search text is not sent to analytics · inquiries use the secure form workflow' : '검색 문장은 분석 도구로 보내지 않음 · 문의만 안전하게 접수'}</span>
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
  const getInputModality = createInputModalityTracker(document);

  renderSuggestions(suggestions, input, runSearch);
  mountInquiryChat(inquiryChat, { locale: IS_ENGLISH ? 'en' : 'ko' });
  syncVisualViewport();
  const visualViewport = window.visualViewport;
  if (visualViewport) {
    visualViewport.addEventListener('resize', syncVisualViewport);
    visualViewport.addEventListener('scroll', syncVisualViewport);
  }
  window.addEventListener('resize', syncVisualViewport);
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
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus({ preventScroll: true });
      }
    }
  });
  attachMobileAction(openPanel);
  document.querySelectorAll('[data-open-rental-safety]').forEach((control) => {
    control.setAttribute('aria-haspopup', 'dialog');
    control.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel('knowledge');
    });
  });
  document.querySelectorAll('[data-open-guided-inquiry]').forEach((control) => {
    control.setAttribute('aria-haspopup', 'dialog');
    control.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel('inquiry');
    });
  });
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
      : inquiryChat.querySelector(INQUIRY_FOCUSABLE_SELECTOR);
    const focusTarget = state.currentMode === 'inquiry' && getInputModality() !== 'keyboard'
      ? closeButton
      : target;
    if (focusTarget) window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 0);
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const bottom = Math.max(0, Math.round(window.innerHeight - height - offsetTop));
    root.style.setProperty('--kw-visual-viewport-height', `${height}px`);
    root.style.setProperty('--kw-visual-viewport-bottom', `${bottom}px`);
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
      status.textContent = IS_ENGLISH
        ? 'Describe the situation in at least two characters.'
        : '두 글자 이상으로 핵심 상황을 적어주세요.';
      status.classList.add('is-error');
      input.focus();
      return;
    }
    if (!state.index) {
      status.textContent = IS_ENGLISH
        ? 'The guide is loading. Please try again.'
        : '자료를 불러오는 중입니다. 잠시 후 다시 눌러주세요.';
      return;
    }

    const result = IS_ENGLISH
      ? searchInternationalRentalSafety(query, { limit: 3 })
      : searchKnowledge(state.index, query, { limit: 3 });
    const matches = result.matches.slice(0, 3);
    status.classList.toggle('is-error', matches.length === 0);
    status.textContent = matches.length
      ? (IS_ENGLISH ? `${matches.length} relevant topic${matches.length === 1 ? '' : 's'} found.` : `관련 자료 ${matches.length}건을 찾았습니다.`)
      : (IS_ENGLISH ? 'No close topic was found. Try a shorter phrase or choose an example.' : '가까운 공개 자료를 찾지 못했습니다. 표현을 바꿔보세요.');
    results.innerHTML = matches.length ? renderMatches(matches) : renderEmpty();
    const topicIds = IS_ENGLISH
      ? result.detectedTopicIds
      : result.detectedLabels.map((item) => item.id);
    sendAnalytics('knowledge_widget_search', {
      query_length: query.length,
      result_count: matches.length,
      topic_labels: topicIds.slice(0, 6).join(',') || 'unclassified',
      guide_locale: IS_ENGLISH ? 'en' : 'ko'
    });
  }
}

async function loadIndex(status, results) {
  state.loading = true;
  status.classList.remove('is-error');
  status.textContent = IS_ENGLISH ? 'Loading the curated rental safety guide.' : '공개 자료를 불러오는 중입니다.';
  try {
    if (IS_ENGLISH) {
      state.index = { international: true };
      status.textContent = `${INTERNATIONAL_RENTAL_ISSUES.length} curated rental safety topics are available.`;
      return;
    }
    const reports = await listPublishedKnowledgeReports({ batchSize: 200 });
    state.index = buildKnowledgeIndex(reports);
    status.textContent = `공개 자료 ${state.index.documents.length.toLocaleString()}건에서 찾아볼 수 있습니다.`;
  } catch (error) {
    console.error('Knowledge widget load failed:', error);
    status.textContent = IS_ENGLISH
      ? 'The safety guide is temporarily unavailable. Use the rental guide on this page.'
      : '자료 연결이 지연되고 있습니다. 전체 자료검색 페이지를 이용해 주세요.';
    status.classList.add('is-error');
    results.innerHTML = IS_ENGLISH
      ? '<a class="lr-knowledge-widget__fallback" href="EN.html#renting">Open the rental guide</a>'
      : '<a class="lr-knowledge-widget__fallback" href="knowledge.html">전체 자료검색 열기</a>';
  } finally {
    state.loading = false;
  }
}

function renderSuggestions(container, input, runSearch) {
  const questions = IS_ENGLISH ? getInternationalRentalSuggestions() : getOntologySuggestions().slice(0, 3);
  container.innerHTML = questions.map((question) => `
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
  if (IS_ENGLISH) return renderInternationalMatches(matches);
  return `<div class="lr-knowledge-widget__result-list">${matches.map((match, index) => {
    const passage = match.passages[0];
    const type = match.contentType === 'dispute_case' ? '계약·분쟁' : '시장·정책';
    return `
      <article>
        <span>${escapeHtml(type)}</span>
        <h3>${escapeHtml(match.title)}</h3>
        ${passage ? `<p><strong>${escapeHtml(passage.heading)}</strong> ${escapeHtml(passage.text)}</p>` : `<p>${escapeHtml(match.summary)}</p>`}
        <a href="${reportStaticHref(match.slug)}" data-widget-result data-position="${index + 1}" data-type="report">원문과 출처 보기</a>
      </article>
    `;
  }).join('')}</div>`;
}

function renderInternationalMatches(matches) {
  return `<div class="lr-knowledge-widget__result-list">${matches.map((match, index) => `
    <article>
      <span>RENTAL SAFETY</span>
      <h3>${escapeHtml(match.title)}</h3>
      <p><strong>Before signing</strong> ${escapeHtml(match.beforeSigning.join(' '))}</p>
      <p><strong>Evidence to keep</strong> ${escapeHtml(match.evidenceToKeep.join(' '))}</p>
      <p><strong>First steps</strong> ${escapeHtml(match.firstSteps.join(' '))}</p>
      <p><strong>When to ask for professional help</strong> ${escapeHtml(match.whenToEscalate)}</p>
      <p><strong>Official sources</strong> ${match.sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer" data-widget-result data-position="${index + 1}" data-type="official-source">${escapeHtml(source.name)}</a>`).join(' · ')}</p>
      <small>Last reviewed ${escapeHtml(match.lastReviewed)}. This is general information, not legal or immigration advice.</small>
    </article>
  `).join('')}</div>`;
}

function renderEmpty() {
  if (IS_ENGLISH) {
    return `
      <div class="lr-knowledge-widget__empty">
        <p>Try a short phrase about the main issue.</p>
        <div><button type="button" data-question="deposit return">Deposit return</button><button type="button" data-question="mold repairs">Mold and repairs</button></div>
        <a href="EN.html#renting">Open the rental guide</a>
      </div>
    `;
  }
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
  button.innerHTML = IS_ENGLISH
    ? '<span aria-hidden="true">✦</span><strong>Safety · contact</strong>'
    : '<span aria-hidden="true">✦</span><strong>자료·문의</strong>';
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
