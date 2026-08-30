import {
  FAMILY_LISTING_STATUSES,
  buildFamilyListingAlias,
  buildStaffShareText,
  buildFamilyParseReview,
  describeIntakeYearMonth,
  ensureUniqueFamilyAlias,
  filterFamilyListings,
  finalizeFamilyParseReview,
  normalizeFamilyListingInput,
  statusLabel
} from './familyListing.mjs';
import {
  createFamilyListing,
  createFamilyParseDraft,
  finalizeFamilyParseDraft,
  listFamilyListingAliases,
  listFamilyListingEvents,
  listFamilyListings,
  listFamilyParseDrafts,
  updateFamilyListing
} from './services/familyListingAdapter.js';
import { getCurrentSessionUser, onAuthStateChange, signOutAdmin } from './services/authService.js';

const refs = {
  form: document.getElementById('familyListingForm'),
  editor: document.getElementById('familyListingEditor'),
  formTitle: document.getElementById('familyFormTitle'),
  id: document.getElementById('familyListingId'),
  aliasPreview: document.getElementById('familyAliasPreview'),
  formStatus: document.getElementById('familyFormStatus'),
  save: document.getElementById('saveFamilyListing'),
  grid: document.getElementById('familyListingsGrid'),
  count: document.getElementById('familyResultCount'),
  search: document.getElementById('familyListingSearch'),
  statusFilter: document.getElementById('familyListingStatusFilter'),
  statusBoard: document.getElementById('familyStatusBoard'),
  open: document.getElementById('openFamilyListingForm'),
  close: document.getElementById('closeFamilyListingForm'),
  cancel: document.getElementById('cancelFamilyListingEdit'),
  logout: document.getElementById('familyLogoutBtn'),
  copyFallback: document.getElementById('familyCopyFallback'),
  sourceText: document.getElementById('familySourceText'),
  requestParse: document.getElementById('requestFamilyParse'),
  refreshParse: document.getElementById('refreshFamilyParse'),
  parseStatus: document.getElementById('familyParseStatus'),
  parseReview: document.getElementById('familyParseReview'),
  parseReviewState: document.getElementById('familyParseReviewState'),
  parseSource: document.getElementById('familyParseSource'),
  parseFields: document.getElementById('familyParseFields'),
  applyParse: document.getElementById('applyFamilyParseReview')
};

const PARSE_FIELD_META = Object.freeze([
  ['neighborhood', 'neighborhood', '동네'],
  ['building_keyword', 'buildingKeyword', '건물 이름·기억할 말'],
  ['unit_label', 'unitLabel', '호수·층'],
  ['transaction_type', 'transactionType', '거래 유형'],
  ['intake_year_month', 'intakeYearMonth', '처음 받은 달'],
  ['status', 'status', '현재 상태'],
  ['price_summary', 'priceSummary', '가격'],
  ['floor_summary', 'floorSummary', '층수'],
  ['layout_summary', 'layoutSummary', '구조'],
  ['move_in_summary', 'moveInSummary', '입주'],
  ['assigned_to', 'assignedTo', '담당'],
  ['source_label', 'sourceLabel', '어디서 들었나요'],
  ['staff_task', 'staffTask', '직원 확인사항'],
  ['internal_notes', 'internalNotes', '내부 메모']
]);

let records = [];
let editingRecord = null;
let isSaving = false;
let activeParseDraft = null;
let activeParseReview = null;
let pendingReviewedParse = null;

init();

async function init() {
  try {
    const user = await getCurrentSessionUser();
    if (!user || user.app_metadata?.role !== 'admin') {
      if (user) await signOutAdmin();
      window.location.href = './login.html';
      return;
    }
    bindEvents();
    onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearSensitiveView();
        window.location.replace('./login.html');
      }
    });
    setDefaultYearMonth();
    updateAliasPreview();
    await reloadRecords();
    await refreshParseDrafts({ silent: true });
  } catch (error) {
    console.error('[Family listings] Initialization failed', error);
    window.location.href = './login.html';
  }
}

function bindEvents() {
  refs.form?.addEventListener('input', updateAliasPreview);
  refs.form?.addEventListener('submit', handleSubmit);
  refs.search?.addEventListener('input', renderRecords);
  refs.statusFilter?.addEventListener('change', () => {
    renderStatusBoard();
    renderRecords();
  });
  refs.open?.addEventListener('click', () => openEditor());
  refs.close?.addEventListener('click', () => refs.editor?.classList.add('is-collapsed'));
  refs.cancel?.addEventListener('click', resetEditor);
  refs.requestParse?.addEventListener('click', requestParseDraft);
  refs.refreshParse?.addEventListener('click', refreshParseDrafts);
  refs.applyParse?.addEventListener('click', applyParseReviewToForm);
  refs.logout?.addEventListener('click', async () => {
    await signOutAdmin();
    window.location.href = './login.html';
  });
}

function setParseStatus(message = '', state = 'info') {
  refs.parseStatus.hidden = !message;
  refs.parseStatus.textContent = message;
  refs.parseStatus.dataset.state = state;
}

function formRecordValues() {
  const values = {};
  for (const [field, formName] of PARSE_FIELD_META) {
    values[field] = refs.form?.elements?.[formName]?.value || '';
  }
  return values;
}

async function requestParseDraft() {
  const sourceText = refs.sourceText?.value || '';
  if (!sourceText.trim()) {
    setParseStatus('정리할 매물 내용을 먼저 적어 주세요.', 'error');
    refs.sourceText?.focus();
    return;
  }
  refs.requestParse.disabled = true;
  setParseStatus('적어둔 내용을 저장하고 있습니다.');
  try {
    activeParseDraft = await createFamilyParseDraft(sourceText, editingRecord?.id || null);
    activeParseReview = null;
    pendingReviewedParse = null;
    renderParseDraft(activeParseDraft);
    setParseStatus('적어둔 내용을 저장했습니다. 정리가 끝나면 여기에서 확인할 수 있어요.', 'success');
  } catch (error) {
    console.error('[Family listings] Parse draft create failed', error);
    setParseStatus(error?.message || '내용 정리를 요청하지 못했습니다.', 'error');
  } finally {
    refs.requestParse.disabled = false;
  }
}

async function refreshParseDrafts(options = {}) {
  if (!options.silent) setParseStatus('정리된 내용을 확인하고 있습니다.');
  try {
    const drafts = await listFamilyParseDrafts();
    const current = activeParseDraft
      ? drafts.find((draft) => draft.id === activeParseDraft.id)
      : drafts.find((draft) => draft.parse_status !== 'reviewed' && (
        editingRecord ? draft.record_id === editingRecord.id : !draft.record_id
      ));
    if (!current) {
      if (!options.silent) setParseStatus('새로 확인할 내용이 없습니다.');
      return;
    }
    activeParseDraft = current;
    if (refs.sourceText && !refs.sourceText.value) refs.sourceText.value = current.source_text;
    renderParseDraft(current);
  } catch (error) {
    console.error('[Family listings] Parse draft load failed', error);
    setParseStatus(error?.message || '정리된 내용을 불러오지 못했습니다.', 'error');
  }
}

function renderParseDraft(draft) {
  refs.parseReview.hidden = false;
  refs.parseSource.replaceChildren();
  const sourceTitle = document.createElement('strong');
  sourceTitle.textContent = '처음 적은 내용';
  const source = document.createElement('pre');
  source.textContent = draft.source_text;
  refs.parseSource.append(sourceTitle, source);
  refs.parseFields.replaceChildren();

  const statusMessages = {
    queued: '정리 대기 중',
    processing: '내용 정리 중',
    review_needed: '내용 확인 필요',
    reviewed: '확인 완료',
    failed: '정리하지 못함'
  };
  refs.parseReviewState.textContent = statusMessages[draft.parse_status] || draft.parse_status;
  if (draft.parse_status === 'failed') {
    refs.parseFields.appendChild(messageNode(draft.parser_error || '정형 입력칸을 직접 작성해 주세요.'));
    refs.applyParse.disabled = true;
    return;
  }
  if (draft.parse_status !== 'review_needed') {
    refs.parseFields.appendChild(messageNode('정리가 끝나면 지금 적힌 내용과 나란히 보여드릴게요.'));
    refs.applyParse.disabled = true;
    return;
  }

  activeParseReview = buildFamilyParseReview({
    sourceText: draft.source_text,
    existingRecord: formRecordValues(),
    suggestions: draft.suggestions
  });
  for (const [field, , label] of PARSE_FIELD_META) {
    refs.parseFields.appendChild(createParseFieldReview(field, label, activeParseReview.fields[field]));
  }
  refs.applyParse.disabled = false;
}

function createParseFieldReview(field, label, candidate) {
  const card = document.createElement('article');
  card.className = `parse-field parse-field--${candidate.status}`;
  card.dataset.parseField = field;
  const heading = document.createElement('div');
  const title = document.createElement('h4');
  title.textContent = label;
  const badge = document.createElement('span');
  const labels = {
    suggested: '새로 정리됨', needs_review: '골라주세요', kept_existing: '그대로 둠', empty: '내용 없음'
  };
  badge.textContent = labels[candidate.status] || candidate.status;
  heading.append(title, badge);
  const existing = document.createElement('p');
  existing.textContent = `지금 적힌 값: ${candidate.existing_value || '없음'}`;
  const suggested = document.createElement('p');
  suggested.textContent = `정리된 값: ${candidate.suggested_value || '없음'}`;
  card.append(heading, existing, suggested);

  if (candidate.status === 'needs_review') {
    const choiceLabel = document.createElement('label');
    choiceLabel.textContent = '어떤 값을 쓸까요?';
    const choice = document.createElement('select');
    choice.dataset.reviewChoice = field;
    choice.append(new Option('선택해 주세요', ''));
    if (candidate.existing_value) choice.append(new Option(`지금 값 · ${candidate.existing_value}`, 'existing'));
    if (candidate.suggested_value) choice.append(new Option(`정리된 값 · ${candidate.suggested_value}`, 'suggested'));
    choice.append(new Option('직접 수정', 'custom'));
    const custom = document.createElement('input');
    custom.dataset.reviewCustom = field;
    custom.placeholder = `${label} 직접 입력`;
    custom.hidden = true;
    choice.addEventListener('change', () => {
      custom.hidden = choice.value !== 'custom';
      if (!custom.hidden) custom.focus();
    });
    choiceLabel.append(choice, custom);
    card.appendChild(choiceLabel);
  }
  return card;
}

async function applyParseReviewToForm() {
  if (!activeParseDraft || !activeParseReview) return;
  const decisions = {};
  for (const choice of refs.parseFields.querySelectorAll('[data-review-choice]')) {
    if (!choice.value) continue;
    const field = choice.dataset.reviewChoice;
    decisions[field] = { choice: choice.value };
    if (choice.value === 'custom') {
      decisions[field].value = refs.parseFields.querySelector(`[data-review-custom="${field}"]`)?.value || '';
    }
  }
  try {
    const reviewed = finalizeFamilyParseReview(activeParseReview, decisions);
    for (const [field, formName] of PARSE_FIELD_META) {
      const control = refs.form.elements[formName];
      if (control) control.value = reviewed.reviewed_values[field] || '';
    }
    pendingReviewedParse = reviewed;
    updateAliasPreview();
    setParseStatus('입력칸에 채웠습니다. 아래 내용만 한번 보고 저장하세요.', 'success');
    refs.save.focus();
  } catch (error) {
    setParseStatus(error?.message || '확인할 항목을 모두 선택해 주세요.', 'error');
  }
}

function clearSensitiveView() {
  records = [];
  editingRecord = null;
  activeParseDraft = null;
  activeParseReview = null;
  pendingReviewedParse = null;
  refs.form?.reset();
  refs.parseSource?.replaceChildren();
  refs.parseFields?.replaceChildren();
  if (refs.parseReview) refs.parseReview.hidden = true;
  refs.statusBoard?.replaceChildren();
  refs.grid?.replaceChildren(messageNode('세션이 만료되어 화면을 잠급니다.'));
  if (refs.editor) refs.editor.hidden = true;
}

function setDefaultYearMonth() {
  const input = refs.form?.elements?.intakeYearMonth;
  if (!input || input.value) return;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  input.value = `${year}-${month}`;
}

function formValues() {
  return Object.fromEntries(new FormData(refs.form).entries());
}

function updateAliasPreview() {
  try {
    const values = formValues();
    if (!values.intakeYearMonth) {
      refs.aliasPreview.textContent = '처음 받은 달을 선택하면 매물 이름이 만들어집니다.';
      return;
    }
    const alias = buildFamilyListingAlias(values);
    const meaning = describeIntakeYearMonth(values.intakeYearMonth);
    refs.aliasPreview.textContent = `${alias} · ${meaning.code} = ${meaning.label}`;
  } catch (error) {
    refs.aliasPreview.textContent = error.message;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSaving) return;
  const values = formValues();
  isSaving = true;
  setSaving(true);
  setFormStatus(editingRecord ? '매물 정보를 수정하고 있습니다.' : '저장하고 있습니다.');
  try {
    const baseAlias = buildFamilyListingAlias(values);
    const aliases = await listFamilyListingAliases();
    const withoutCurrent = aliases.filter((value) => value !== editingRecord?.alias_code);
    const aliasCode = ensureUniqueFamilyAlias(baseAlias, withoutCurrent);
    const payload = normalizeFamilyListingInput(values, { aliasCode });
    if (pendingReviewedParse && activeParseDraft) {
      await finalizeFamilyParseDraft(activeParseDraft.id, payload);
      setFormStatus(editingRecord ? '확인한 내용으로 매물 정보를 수정했습니다.' : '확인한 내용을 저장했습니다.', 'success');
      pendingReviewedParse = null;
    } else if (editingRecord) {
      await updateFamilyListing(editingRecord.id, payload);
      setFormStatus('매물 정보를 수정했습니다.', 'success');
    } else {
      await createFamilyListing(payload);
      setFormStatus('저장했습니다.', 'success');
    }
    await reloadRecords();
    resetEditor({ keepStatus: true });
  } catch (error) {
    console.error('[Family listings] Save failed', error);
    const duplicate = String(error?.code || '') === '23505';
    setFormStatus(duplicate ? '같은 매물 이름이 이미 있습니다. 받은 달이나 건물 이름을 확인해 주세요.' : (error?.message || '저장하지 못했습니다.'), 'error');
  } finally {
    isSaving = false;
    setSaving(false);
  }
}

function setSaving(value) {
  refs.save.disabled = value;
  for (const control of refs.form.querySelectorAll('input, select, textarea, button')) {
    if (control !== refs.save) control.disabled = value;
  }
}

function setFormStatus(message = '', state = 'info') {
  refs.formStatus.hidden = !message;
  refs.formStatus.textContent = message;
  refs.formStatus.dataset.state = state;
}

async function reloadRecords() {
  refs.grid.replaceChildren(messageNode('매물을 불러오는 중입니다.'));
  records = await listFamilyListings();
  renderStatusBoard();
  renderRecords();
}

function renderStatusBoard() {
  refs.statusBoard.replaceChildren();
  const counts = Object.fromEntries(Object.keys(FAMILY_LISTING_STATUSES).map((key) => [key, 0]));
  for (const record of records) if (Object.hasOwn(counts, record.status)) counts[record.status] += 1;
  for (const [status, label] of Object.entries(FAMILY_LISTING_STATUSES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'status-summary';
    const isActive = refs.statusFilter.value === status;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    const count = document.createElement('strong');
    count.textContent = String(counts[status]);
    const text = document.createElement('span');
    text.textContent = label;
    button.append(count, text);
    button.addEventListener('click', () => {
      refs.statusFilter.value = refs.statusFilter.value === status ? '' : status;
      renderStatusBoard();
      renderRecords();
    });
    refs.statusBoard.appendChild(button);
  }
}

function renderRecords() {
  const filtered = filterFamilyListings(records, {
    query: refs.search.value,
    status: refs.statusFilter.value
  });
  refs.count.textContent = String(filtered.length);
  refs.grid.replaceChildren();
  if (!filtered.length) {
    refs.grid.appendChild(messageNode(records.length ? '조건에 맞는 매물이 없습니다.' : '아직 정리한 매물이 없습니다.'));
    return;
  }
  for (const record of filtered) refs.grid.appendChild(createRecordCard(record));
}

function messageNode(text) {
  const node = document.createElement('p');
  node.className = 'family-empty';
  node.textContent = text;
  return node;
}

function createRecordCard(record) {
  const article = document.createElement('article');
  article.className = 'listing-card';

  const top = document.createElement('div');
  top.className = 'listing-card__top';
  const title = document.createElement('h3');
  title.className = 'listing-card__title';
  title.textContent = `${record.neighborhood} ${record.building_keyword} ${record.unit_label} ${record.transaction_type}`;
  const badge = document.createElement('span');
  badge.className = 'listing-card__status';
  badge.textContent = statusLabel(record.status);
  top.append(title, badge);

  const alias = document.createElement('p');
  alias.className = 'listing-card__alias';
  alias.textContent = `매물 이름: ${record.alias_code}`;

  const date = document.createElement('p');
  date.className = 'listing-card__date';
  const meaning = describeIntakeYearMonth(record.intake_year_month);
  const code = document.createElement('code');
  code.textContent = meaning.code;
  date.append(code, document.createTextNode(meaning.label));

  const facts = document.createElement('dl');
  facts.className = 'listing-card__facts';
  appendFact(facts, '위치', [record.neighborhood, record.building_keyword, record.unit_label].filter(Boolean).join(' '));
  appendFact(facts, '거래', record.transaction_type);
  appendFact(facts, '가격', record.price_summary || '확인 필요');
  appendFact(facts, '구조·층', [record.layout_summary, record.floor_summary].filter(Boolean).join(' · ') || '확인 필요');
  appendFact(facts, '입주', record.move_in_summary || '확인 필요');
  appendFact(facts, '담당·출처', [record.assigned_to, record.source_label].filter(Boolean).join(' · ') || '미정');

  article.append(top, alias, date, facts);
  if (record.staff_task) {
    const task = document.createElement('p');
    task.className = 'listing-card__task';
    task.textContent = `직원 확인: ${record.staff_task}`;
    article.appendChild(task);
  }
  if (record.internal_notes) {
    const note = document.createElement('p');
    note.className = 'listing-card__internal';
    note.textContent = `메모: ${record.internal_notes}`;
    article.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'listing-card__actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.dataset.copyStaff = record.id;
  copy.textContent = '직원방용 복사';
  copy.addEventListener('click', () => copyStaffText(record, copy));
  const history = document.createElement('button');
  history.type = 'button';
  history.dataset.history = record.id;
  history.textContent = '변경 이력';
  const historyPanel = document.createElement('div');
  historyPanel.id = `family-history-${record.id}`;
  historyPanel.className = 'listing-card__history';
  historyPanel.hidden = true;
  history.setAttribute('aria-controls', historyPanel.id);
  history.setAttribute('aria-expanded', 'false');
  history.addEventListener('click', () => toggleHistory(record, history, historyPanel));
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = '수정';
  edit.addEventListener('click', () => openEditor(record));
  actions.append(copy, history, edit);
  article.append(actions, historyPanel);
  return article;
}

async function toggleHistory(record, button, panel) {
  if (!panel.hidden) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '변경 이력';
    return;
  }
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  panel.replaceChildren(messageNode('이력을 불러오는 중입니다.'));
  button.disabled = true;
  try {
    const events = await listFamilyListingEvents(record.id);
    panel.replaceChildren();
    if (!events.length) {
      panel.appendChild(messageNode('아직 기록된 변경 이력이 없습니다.'));
    } else {
      const list = document.createElement('ol');
      for (const event of events) {
        const item = document.createElement('li');
        const action = event.event_type === 'created'
          ? `매물 접수 · ${statusLabel(event.status_to)}`
          : event.event_type === 'status_changed'
            ? `${statusLabel(event.status_from)} → ${statusLabel(event.status_to)}`
            : '매물 정보 수정';
        const time = new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'
        }).format(new Date(event.created_at));
        item.textContent = `${action} · ${time}`;
        list.appendChild(item);
      }
      panel.appendChild(list);
    }
    button.textContent = '이력 닫기';
  } catch (error) {
    console.error('[Family listings] History load failed', error);
    panel.replaceChildren(messageNode('이력을 불러오지 못했습니다.'));
  } finally {
    button.disabled = false;
  }
}

function appendFact(list, term, value) {
  const box = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = term;
  dd.textContent = value || '-';
  box.append(dt, dd);
  list.appendChild(box);
}

async function copyStaffText(record, button) {
  const text = buildStaffShareText(record);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      refs.copyFallback.value = text;
      refs.copyFallback.select();
      document.execCommand('copy');
    }
    const old = button.textContent;
    button.textContent = '복사 완료';
    window.setTimeout(() => { button.textContent = old; }, 1500);
  } catch (error) {
    console.error('[Family listings] Clipboard failed', error);
    setFormStatus('복사하지 못했습니다. 브라우저 권한을 확인해 주세요.', 'error');
  }
}

function resetParseEditor(options = {}) {
  activeParseDraft = null;
  activeParseReview = null;
  pendingReviewedParse = null;
  if (refs.sourceText) refs.sourceText.value = '';
  refs.parseSource?.replaceChildren();
  refs.parseFields?.replaceChildren();
  if (refs.parseReview) refs.parseReview.hidden = true;
  if (!options.keepStatus) setParseStatus('');
}

function openEditor(record = null) {
  editingRecord = record;
  resetParseEditor();
  refs.editor.classList.remove('is-collapsed');
  refs.form.reset();
  setDefaultYearMonth();
  if (record) {
    refs.formTitle.textContent = '매물 정보 수정';
    refs.id.value = record.id;
    const values = {
      neighborhood: record.neighborhood,
      buildingKeyword: record.building_keyword,
      unitLabel: record.unit_label,
      transactionType: record.transaction_type,
      intakeYearMonth: record.intake_year_month,
      status: record.status,
      priceSummary: record.price_summary,
      floorSummary: record.floor_summary,
      layoutSummary: record.layout_summary,
      moveInSummary: record.move_in_summary,
      assignedTo: record.assigned_to,
      sourceLabel: record.source_label,
      staffTask: record.staff_task,
      internalNotes: record.internal_notes
    };
    for (const [name, value] of Object.entries(values)) {
      const control = refs.form.elements[name];
      if (control) control.value = value || '';
    }
  } else {
    refs.formTitle.textContent = '새 매물 적기';
  }
  setFormStatus('');
  updateAliasPreview();
  refs.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEditor(options = {}) {
  editingRecord = null;
  resetParseEditor({ keepStatus: options.keepStatus });
  refs.form.reset();
  refs.id.value = '';
  refs.formTitle.textContent = '새 매물 적기';
  setDefaultYearMonth();
  updateAliasPreview();
  if (!options.keepStatus) setFormStatus('');
}
