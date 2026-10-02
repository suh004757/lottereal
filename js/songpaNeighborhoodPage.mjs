import { rankNeighborhoods } from './songpaNeighborhoodMatcher.mjs';

const CONFIG_URL = new URL('../Data/songpa-neighborhood-guide.v1.json', import.meta.url);

function track(name, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, {
    page_path: window.location.pathname,
    tool_name: 'songpa_neighborhood_helper',
    ...params,
  });
}

function appendList(container, title, items, className) {
  const section = document.createElement('section');
  section.className = className;
  const heading = document.createElement('h4');
  heading.textContent = title;
  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    row.textContent = item;
    list.append(row);
  }
  section.append(heading, list);
  container.append(section);
}

function resultCard(result, rank) {
  const article = document.createElement('article');
  article.className = 'nh-result-card';

  const head = document.createElement('div');
  head.className = 'nh-result-card__head';
  const rankLabel = document.createElement('span');
  rankLabel.className = 'nh-result-card__rank';
  rankLabel.textContent = String(rank).padStart(2, '0');
  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'nh-result-card__eyebrow';
  eyebrow.textContent = result.eyebrow;
  const title = document.createElement('h3');
  title.textContent = result.name;
  titleWrap.append(eyebrow, title);
  head.append(rankLabel, titleWrap);

  const summary = document.createElement('p');
  summary.className = 'nh-result-card__summary';
  summary.textContent = result.summary;
  const housing = document.createElement('p');
  housing.className = 'nh-result-card__housing';
  housing.textContent = `주로 비교할 유형 · ${result.housingTypes}`;

  article.append(head, summary, housing);
  appendList(article, '선택 조건과 맞는 이유', result.reasons, 'nh-result-card__reasons');
  appendList(article, '현장에서 꼭 확인', result.fieldChecks, 'nh-result-card__checks');
  appendList(article, '함께 감수할 점', result.tradeoffs, 'nh-result-card__tradeoffs');

  const actions = document.createElement('div');
  actions.className = 'nh-result-card__actions';
  const listings = document.createElement('a');
  listings.href = 'listings.html';
  listings.textContent = '현재 매물 보기';
  listings.dataset.neighborhoodListing = '';
  const contact = document.createElement('a');
  contact.href = 'contact.html#inquiry-options';
  contact.textContent = '동네 조건 상담';
  contact.dataset.neighborhoodContact = '';
  actions.append(listings, contact);
  article.append(actions);
  return article;
}

async function loadConfig() {
  const response = await fetch(CONFIG_URL, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`config ${response.status}`);
  return response.json();
}

async function init() {
  const form = document.querySelector('#neighborhood-helper-form');
  const result = document.querySelector('#neighborhood-helper-result');
  const cards = document.querySelector('[data-neighborhood-results]');
  const empty = document.querySelector('[data-neighborhood-empty]');
  const error = document.querySelector('#neighborhood-helper-error');
  const count = document.querySelector('[data-priority-count]');
  const submit = form?.querySelector('button[type="submit"]');
  if (!form || !result || !cards || !empty || !error || !count || !submit) return;

  let config;
  let started = false;
  try {
    config = await loadConfig();
    submit.disabled = false;
    count.textContent = `0 / ${config.maxPrioritySelections}`;
  } catch (_) {
    error.textContent = '선택 도우미 설정을 불러오지 못했습니다. 잠시 후 다시 시도하거나 매물·문의 페이지를 이용해 주세요.';
    error.hidden = false;
    return;
  }

  function selectedPriorities() {
    return [...form.querySelectorAll('input[name="priority"]:checked')].map((input) => input.value);
  }

  function updatePriorityState(changedInput) {
    const selected = selectedPriorities();
    if (selected.length > config.maxPrioritySelections && changedInput) {
      changedInput.checked = false;
      error.textContent = `중요 조건은 최대 ${config.maxPrioritySelections}개까지 선택할 수 있습니다.`;
      error.hidden = false;
      error.focus();
    } else {
      error.hidden = true;
    }
    count.textContent = `${selectedPriorities().length} / ${config.maxPrioritySelections}`;
  }

  form.addEventListener('change', (event) => {
    if (!started) {
      track('neighborhood_helper_start');
      started = true;
    }
    if (event.target.matches('input[name="priority"]')) updatePriorityState(event.target);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    try {
      const purpose = form.querySelector('input[name="purpose"]:checked')?.value;
      const priorities = selectedPriorities();
      const matches = rankNeighborhoods({ purpose, priorities }, config);
      cards.replaceChildren(...matches.map((match, index) => resultCard(match, index + 1)));
      empty.hidden = true;
      cards.hidden = false;
      result.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      track('neighborhood_helper_complete', { result_count: matches.length });
    } catch (caught) {
      error.textContent = caught instanceof RangeError
        ? caught.message
        : '결과를 계산하지 못했습니다. 선택 내용을 다시 확인해 주세요.';
      error.hidden = false;
      error.focus();
    }
  });

  form.addEventListener('reset', () => {
    window.setTimeout(() => {
      cards.replaceChildren();
      cards.hidden = true;
      empty.hidden = false;
      error.hidden = true;
      count.textContent = `0 / ${config.maxPrioritySelections}`;
      form.querySelector('input[name="purpose"]')?.focus();
    }, 0);
  });

  cards.addEventListener('click', (event) => {
    if (event.target.closest('[data-neighborhood-listing]')) {
      track('neighborhood_helper_listing_click');
    }
    if (event.target.closest('[data-neighborhood-contact]')) {
      track('neighborhood_helper_contact_click');
    }
  });
}

if (typeof document !== 'undefined') init();
