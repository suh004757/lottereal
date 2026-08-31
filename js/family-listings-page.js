import {
  buildFamilyListingAlias,
  buildOriginalListingShareText,
  buildQuickFamilyListingInput,
  buildStaffShareText,
  describeIntakeYearMonth,
  ensureUniqueFamilyAlias,
  filterFamilyListings,
  groupFamilyListingPhotos,
  normalizeFamilyListingInput,
  shouldQueueFamilySourceDraft,
  statusLabel
} from './familyListing.mjs';
import { buildAdminIntakePayload } from './adminIntake.mjs';
import { attachPendingImageManifest, validateAdminIntakeImages } from './adminIntakeImageRules.mjs';
import { saveAdminIntakeDraft, finalizeFamilyListingImages } from './services/adminIntakeAdapter.js';
import {
  createAdminIntakeImageSignedUrls,
  createAdminIntakeImageShareFiles,
  createAdminIntakeThumbnail,
  downloadAdminIntakeImage,
  removeAdminIntakeImages,
  uploadFamilyListingImages
} from './services/adminIntakeImageAdapter.js';
import {
  archiveFamilyListingAsOwner,
  createFamilyListing,
  createFamilyParseDraft,
  getFamilyListingMembership,
  listFamilyListingAliases,
  listFamilyListingEvents,
  listFamilyListingPhotoBatches,
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

  close: document.getElementById('closeFamilyListingForm'),
  cancel: document.getElementById('cancelFamilyListingEdit'),
  logout: document.getElementById('familyLogoutBtn'),
  copyFallback: document.getElementById('familyCopyFallback'),
  sourceText: document.getElementById('familySourceText'),
  openQuickPost: document.getElementById('openQuickPost'),
  openPhotoTask: document.getElementById('openPhotoTask'),
  quickPostPanel: document.getElementById('familyQuickPostPanel'),
  photoTaskPanel: document.getElementById('familyPhotoTaskPanel'),
  quickPostForm: document.getElementById('familyQuickPostForm'),
  photoTaskForm: document.getElementById('familyPhotoTaskForm'),
  quickPhotos: document.getElementById('familyQuickPhotos'),
  quickPhotoPreview: document.getElementById('familyQuickPhotoPreview'),
  quickPostStatus: document.getElementById('familyQuickPostStatus'),
  photoTaskStatus: document.getElementById('familyPhotoTaskStatus'),
  photoDialog: document.getElementById('familyPhotoDialog'),
  cardPhotoForm: document.getElementById('familyCardPhotoForm'),
  cardPhotoInput: document.querySelector('[data-family-photo-input]'),
  cardPhotoPreview: document.getElementById('familyCardPhotoPreview'),
  cardPhotoStatus: document.getElementById('familyCardPhotoStatus'),
  photoListingName: document.getElementById('familyPhotoListingName'),
  closePhotoDialog: document.getElementById('closeFamilyPhotoDialog')
};

let records = [];
let editingRecord = null;
let isSaving = false;
let photoMap = {};
let parseDraftMap = new Map();
let sourceDraftMap = new Map();
let quickPhotoSelection = [];
let cardPhotoSelection = [];
let activePhotoRecord = null;
let isQuickSaving = false;
let isSelectingPhotos = false;
let photoSelectionGeneration = 0;
let decorationGeneration = 0;
let parseRequestGeneration = 0;
let quickRecordOperationId = null;
let quickSourceOperationId = null;
let photoTaskOperationId = null;
const pendingPhotoFinalizations = new Map();
const pendingSourceDraftIds = new Map();
let parsePollTimer = null;
let currentFamilyRole = null;

init();

async function init() {
  try {
    const user = await getCurrentSessionUser();
    if (!user || user.app_metadata?.role !== 'admin') {
      if (user) await signOutAdmin();
      window.location.href = './login.html';
      return;
    }
    const membership = await getFamilyListingMembership(user.id);
    currentFamilyRole = membership?.family_role || null;
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
    startParsePolling();
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
    renderRecords();
  });

  refs.close?.addEventListener('click', () => refs.editor?.classList.add('is-collapsed'));
  refs.cancel?.addEventListener('click', resetEditor);
  refs.openQuickPost?.addEventListener('click', () => openQuickPanel('post'));
  refs.openPhotoTask?.addEventListener('click', () => openQuickPanel('photo_task'));
  document.querySelectorAll('[data-close-quick]').forEach((button) => button.addEventListener('click', closeQuickPanels));
  refs.quickPostForm?.addEventListener('submit', handleQuickPost);
  refs.photoTaskForm?.addEventListener('submit', handlePhotoTask);
  refs.quickPhotos?.addEventListener('change', () => selectPhotos('quick'));
  refs.cardPhotoInput?.addEventListener('change', () => selectPhotos('card'));
  refs.cardPhotoForm?.addEventListener('submit', handleCardPhotoUpload);
  refs.closePhotoDialog?.addEventListener('click', closePhotoDialog);
  refs.photoDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePhotoDialog();
  });
  refs.photoDialog?.addEventListener('close', cleanupPhotoDialogState);
  refs.logout?.addEventListener('click', async () => {
    await signOutAdmin();
    window.location.href = './login.html';
  });
}

function openQuickPanel(mode) {
  if (isSelectingPhotos) return;
  const isPost = mode === 'post';
  if (!isPost && !refs.quickPostPanel.hidden) resetQuickPostInputs();
  refs.quickPostPanel.hidden = !isPost;
  refs.photoTaskPanel.hidden = isPost;
  setQuickChoiceMode(mode);
  const panel = isPost ? refs.quickPostPanel : refs.photoTaskPanel;
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel?.querySelector('input')?.focus({ preventScroll: true });
}

function setQuickChoiceMode(mode = '') {
  refs.openQuickPost?.setAttribute('aria-pressed', String(mode === 'post'));
  refs.openPhotoTask?.setAttribute('aria-pressed', String(mode === 'photo_task'));
}

function closeQuickPanels() {
  if (isQuickSaving || isSelectingPhotos) return;
  resetQuickPostInputs();
  refs.photoTaskForm?.reset();
  photoTaskOperationId = null;
  setElementStatus(refs.photoTaskStatus, '');
  refs.quickPostPanel.hidden = true;
  refs.photoTaskPanel.hidden = true;
  setQuickChoiceMode();
}

function setElementStatus(element, message = '', state = 'info') {
  if (!element) return;
  element.hidden = !message;
  element.textContent = message;
  element.dataset.state = state;
}

function appendImmediateShare(element, record, sourceText, files) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'share-now';
  button.textContent = '지금 공유하기';
  const errorMessage = document.createElement('p');
  errorMessage.className = 'share-error';
  errorMessage.hidden = true;
  errorMessage.setAttribute('role', 'alert');
  button.addEventListener('click', async () => {
    const confirmed = window.confirm('공유할 글과 사진에 얼굴, 연락처, 문서, 계좌·출입번호가 보이지 않는지 확인했나요?');
    if (!confirmed) return;
    const old = button.textContent;
    button.disabled = true;
    errorMessage.hidden = true;
    try {
      const payload = {
        title: `${record.neighborhood} ${record.building_keyword}`,
        text: buildOriginalListingShareText(record, sourceText)
      };
      if (files.length && navigator.canShare?.({ files })) payload.files = files;
      if (navigator.share) await navigator.share(payload);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload.text);
      else {
        refs.copyFallback.value = payload.text;
        refs.copyFallback.select();
        document.execCommand('copy');
      }
      button.textContent = navigator.share ? '공유 완료' : '글 복사 완료';
    } catch (error) {
      if (error?.name !== 'AbortError') {
        errorMessage.textContent = '공유하지 못했습니다. 잠시 후 다시 눌러 주세요.';
        errorMessage.hidden = false;
      }
    } finally {
      button.disabled = false;
      window.setTimeout(() => { button.textContent = old; }, 1600);
    }
  });
  element.append(button, errorMessage);
}

function appendSourceRetry(element, record, sourceText, draftId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'source-retry';
  button.textContent = '원글 다시 저장';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await createFamilyParseDraft(sourceText, record.id, { id: draftId });
      button.textContent = '원글 저장 완료';
      const generation = decorationGeneration;
      const changed = await loadParseDraftMap(generation);
      if (changed && generation === decorationGeneration) renderRecords();
    } catch (error) {
      console.error('[Family listings] Source retry failed', error);
      button.textContent = '다시 시도';
      button.disabled = false;
    }
  });
  element.appendChild(button);
}

function revokeSelection(selection) {
  for (const item of selection) if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
}

function renderPhotoSelection(selection, container) {
  container?.replaceChildren();
  if (!selection.length) return;
  const count = document.createElement('p');
  count.textContent = `선택한 사진 ${selection.length}장`;
  container.appendChild(count);
  for (const item of selection) {
    const image = document.createElement('img');
    image.src = item.thumbnailUrl;
    image.alt = item.file.name || '선택한 매물 사진';
    container.appendChild(image);
  }
}

function resetQuickPostInputs(options = {}) {
  refs.quickPostForm?.reset();
  revokeSelection(quickPhotoSelection);
  quickPhotoSelection = [];
  quickRecordOperationId = null;
  quickSourceOperationId = null;
  renderPhotoSelection([], refs.quickPhotoPreview);
  if (!options.keepStatus) setElementStatus(refs.quickPostStatus, '');
}

async function selectPhotos(kind) {
  if (isQuickSaving || isSelectingPhotos) return;
  const isQuick = kind === 'quick';
  const input = isQuick ? refs.quickPhotos : refs.cardPhotoInput;
  const preview = isQuick ? refs.quickPhotoPreview : refs.cardPhotoPreview;
  const oldSelection = isQuick ? quickPhotoSelection : cardPhotoSelection;
  const created = [];
  const generation = ++photoSelectionGeneration;
  isSelectingPhotos = true;
  setPhotoSelectionLocked(kind, true);
  try {
    const files = validateAdminIntakeImages(input.files);
    for (const file of files) {
      created.push({ file, thumbnailUrl: await createAdminIntakeThumbnail(file) });
      if (generation !== photoSelectionGeneration) throw new DOMException('사진 선택이 취소됐습니다.', 'AbortError');
    }
    revokeSelection(oldSelection);
    if (isQuick) quickPhotoSelection = created;
    else cardPhotoSelection = created;
    renderPhotoSelection(created, preview);
  } catch (error) {
    revokeSelection(created);
    if (generation === photoSelectionGeneration) input.value = '';
    if (error?.name !== 'AbortError') {
      setElementStatus(isQuick ? refs.quickPostStatus : refs.cardPhotoStatus, error?.message || '사진을 읽지 못했습니다.', 'error');
    }
  } finally {
    if (generation === photoSelectionGeneration) {
      isSelectingPhotos = false;
      setPhotoSelectionLocked(kind, false);
    }
  }
}

function setPhotoSelectionLocked(kind, locked) {
  const form = kind === 'quick' ? refs.quickPostForm : refs.cardPhotoForm;
  const input = kind === 'quick' ? refs.quickPhotos : refs.cardPhotoInput;
  input.disabled = locked;
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = locked;
  document.querySelectorAll('[data-close-quick]').forEach((button) => { button.disabled = locked; });
  refs.closePhotoDialog.disabled = locked;
  refs.openQuickPost.disabled = locked;
  refs.openPhotoTask.disabled = locked;
  refs.logout.disabled = locked;
}

function setFormLocked(form, locked) {
  for (const control of form?.querySelectorAll('input, select, textarea, button') || []) control.disabled = locked;
}

async function createQuickRecord(values, operationId) {
  const quick = buildQuickFamilyListingInput(values, { now: new Date() });
  const baseAlias = buildFamilyListingAlias(quick);
  const aliases = await listFamilyListingAliases();
  const aliasCode = ensureUniqueFamilyAlias(baseAlias, aliases);
  return createFamilyListing(normalizeFamilyListingInput(quick, { aliasCode }), { id: operationId });
}

async function savePhotosForRecord(record, files, onProgress = () => {}) {
  if (!files.length) return [];
  const pending = pendingPhotoFinalizations.get(record.id);
  if (pending) {
    try {
      await finalizeFamilyListingImages(pending.draftId, pending.uploads);
      pendingPhotoFinalizations.delete(record.id);
      return pending.uploads.previewPaths;
    } catch (error) {
      if (error?.safeToCleanup) {
        await removeAdminIntakeImages([...pending.uploads.previewPaths, ...pending.uploads.originalPaths]);
        pendingPhotoFinalizations.delete(record.id);
      }
      throw error;
    }
  }
  const user = await getCurrentSessionUser();
  if (!user || user.app_metadata?.role !== 'admin') throw new Error('로그인을 다시 확인해 주세요.');
  if (!globalThis.crypto?.randomUUID) throw new Error('이 브라우저에서는 사진을 저장할 수 없습니다.');
  const draftId = globalThis.crypto.randomUUID();
  let payload = buildAdminIntakePayload({
    type: 'listing',
    text: buildAdvertisingDraftText(record),
    region: record.neighborhood,
    transactionType: record.transaction_type
  }, { now: new Date(), nonce: draftId.slice(0, 8) });
  payload.id = draftId;
  payload.metadata.submitted_by = user.id;
  payload.metadata.family_listing_id = record.id;
  payload = attachPendingImageManifest(payload, {
    userId: user.id,
    draftId,
    imageCount: files.length
  });
  const saved = await saveAdminIntakeDraft(payload);
  let uploads;
  try {
    uploads = await uploadFamilyListingImages(files, {
      userId: user.id,
      batchId: saved.id,
      onProgress
    });
  } catch (uploadError) {
    const completedPaths = Array.isArray(uploadError?.completedPaths) ? uploadError.completedPaths : [];
    if (completedPaths.length) {
      await removeAdminIntakeImages(completedPaths).catch((cleanupError) => {
        console.error('[Family listings] Partial photo cleanup failed', cleanupError);
      });
    }
    throw uploadError;
  }
  pendingPhotoFinalizations.set(record.id, { draftId: saved.id, uploads });
  try {
    await finalizeFamilyListingImages(saved.id, uploads);
    pendingPhotoFinalizations.delete(record.id);
    return uploads.previewPaths;
  } catch (error) {
    if (error?.safeToCleanup) {
      await removeAdminIntakeImages([...uploads.previewPaths, ...uploads.originalPaths]);
      pendingPhotoFinalizations.delete(record.id);
    }
    throw error;
  }
}

async function handleQuickPost(event) {
  event.preventDefault();
  if (isQuickSaving || isSelectingPhotos) return;
  const values = Object.fromEntries(new FormData(refs.quickPostForm).entries());
  const files = quickPhotoSelection.map((item) => item.file);
  if (!globalThis.crypto?.randomUUID) {
    setElementStatus(refs.quickPostStatus, '이 브라우저에서는 매물을 안전하게 저장할 수 없습니다.', 'error');
    return;
  }
  quickRecordOperationId ||= globalThis.crypto.randomUUID();
  quickSourceOperationId ||= globalThis.crypto.randomUUID();
  const recordOperationId = quickRecordOperationId;
  const sourceOperationId = quickSourceOperationId;
  isQuickSaving = true;
  setFormLocked(refs.quickPostForm, true);
  setElementStatus(refs.quickPostStatus, '매물을 저장하고 있습니다.');
  let record = null;
  let sourceSaved = false;
  try {
    record = await createQuickRecord({ ...values, mode: 'post' }, recordOperationId);
    try {
      await createFamilyParseDraft(values.text, record.id, { id: sourceOperationId });
      sourceSaved = true;
    } catch (sourceError) {
      console.error('[Family listings] Source persistence failed', sourceError);
    }
    if (files.length) {
      await savePhotosForRecord(record, files, ({ completed, total }) => {
        setElementStatus(refs.quickPostStatus, `매물 저장됨 · 사진 ${completed}/${total}장 저장 중`);
      });
    }
    const successMessage = sourceSaved
      ? (files.length ? '글과 사진을 함께 저장했습니다.' : '매물을 저장했습니다. 사진은 카드에서 나중에 추가할 수 있어요.')
      : '매물과 사진은 저장됐지만 원글 저장을 다시 확인해야 합니다.';
    setElementStatus(refs.quickPostStatus, successMessage, sourceSaved ? 'success' : 'error');
    if (!sourceSaved) appendSourceRetry(refs.quickPostStatus, record, values.text, sourceOperationId);
    appendImmediateShare(refs.quickPostStatus, record, values.text, files);
    await reloadRecords();
    resetQuickPostInputs({ keepStatus: true });
  } catch (error) {
    console.error('[Family listings] Quick post failed', error);
    const message = record
      ? (sourceSaved
        ? '매물과 원글은 저장됐습니다. 사진만 해당 카드에서 다시 추가해 주세요.'
        : '매물은 저장됐습니다. 원글과 사진을 아래에서 다시 확인해 주세요.')
      : '매물을 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.';
    setElementStatus(refs.quickPostStatus, message, record && sourceSaved ? 'success' : 'error');
    if (record && !sourceSaved) appendSourceRetry(refs.quickPostStatus, record, values.text, sourceOperationId);
    if (record) appendImmediateShare(refs.quickPostStatus, record, values.text, files);
    if (record) {
      resetQuickPostInputs({ keepStatus: true });
      await reloadRecords().catch(() => {});
    }
  } finally {
    isQuickSaving = false;
    setFormLocked(refs.quickPostForm, false);
  }
}

async function handlePhotoTask(event) {
  event.preventDefault();
  if (isQuickSaving || isSelectingPhotos) return;
  const values = Object.fromEntries(new FormData(refs.photoTaskForm).entries());
  if (!globalThis.crypto?.randomUUID) {
    setElementStatus(refs.photoTaskStatus, '이 브라우저에서는 촬영할 곳을 안전하게 저장할 수 없습니다.', 'error');
    return;
  }
  photoTaskOperationId ||= globalThis.crypto.randomUUID();
  isQuickSaving = true;
  setFormLocked(refs.photoTaskForm, true);
  setElementStatus(refs.photoTaskStatus, '촬영할 곳을 저장하고 있습니다.');
  try {
    await createQuickRecord({ ...values, mode: 'photo_task', status: 'needs_info' }, photoTaskOperationId);
    setElementStatus(refs.photoTaskStatus, '저장했습니다. 게시판 카드에서 사진을 추가하세요.', 'success');
    refs.photoTaskForm.reset();
    photoTaskOperationId = null;
    await reloadRecords();
  } catch (error) {
    console.error('[Family listings] Photo task save failed', error);
    setElementStatus(refs.photoTaskStatus, '촬영할 곳을 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.', 'error');
  } finally {
    isQuickSaving = false;
    setFormLocked(refs.photoTaskForm, false);
  }
}

function openPhotoDialog(record) {
  activePhotoRecord = record;
  refs.photoListingName.textContent = `${record.alias_code} · ${record.neighborhood} ${record.building_keyword} ${record.unit_label} · ${record.transaction_type}`;
  refs.cardPhotoForm.reset();
  revokeSelection(cardPhotoSelection);
  cardPhotoSelection = [];
  renderPhotoSelection([], refs.cardPhotoPreview);
  setElementStatus(refs.cardPhotoStatus, '');
  refs.photoDialog.showModal();
}

function closePhotoDialog() {
  if (isQuickSaving || isSelectingPhotos) return;
  if (refs.photoDialog.open) refs.photoDialog.close();
  cleanupPhotoDialogState();
}

function cleanupPhotoDialogState() {
  activePhotoRecord = null;
  revokeSelection(cardPhotoSelection);
  cardPhotoSelection = [];
  refs.cardPhotoForm?.reset();
  renderPhotoSelection([], refs.cardPhotoPreview);
}

async function handleCardPhotoUpload(event) {
  event.preventDefault();
  if (isQuickSaving || isSelectingPhotos || !activePhotoRecord) return;
  const files = cardPhotoSelection.map((item) => item.file);
  if (!files.length) {
    setElementStatus(refs.cardPhotoStatus, '저장할 사진을 골라 주세요.', 'error');
    return;
  }
  isQuickSaving = true;
  setFormLocked(refs.cardPhotoForm, true);
  try {
    await savePhotosForRecord(activePhotoRecord, files, ({ completed, total }) => {
      setElementStatus(refs.cardPhotoStatus, `이 매물에 사진 ${completed}/${total}장 저장 중`);
    });
    setElementStatus(refs.cardPhotoStatus, '이 매물에 사진을 저장했습니다.', 'success');
    await reloadRecords();
    window.setTimeout(closePhotoDialog, 900);
  } catch (error) {
    console.error('[Family listings] Card photo upload failed', error);
    setElementStatus(refs.cardPhotoStatus, '사진을 저장하지 못했습니다. 이 매물에서 다시 추가해 주세요.', 'error');
  } finally {
    isQuickSaving = false;
    setFormLocked(refs.cardPhotoForm, false);
  }
}

function clearSensitiveView() {
  currentFamilyRole = null;
  records = [];
  photoMap = {};
  parseDraftMap = new Map();
  sourceDraftMap = new Map();
  pendingPhotoFinalizations.clear();
  pendingSourceDraftIds.clear();
  photoSelectionGeneration += 1;
  decorationGeneration += 1;
  parseRequestGeneration += 1;
  isSelectingPhotos = false;
  if (parsePollTimer) window.clearInterval(parsePollTimer);
  parsePollTimer = null;
  resetQuickPostInputs();
  refs.photoTaskForm?.reset();
  photoTaskOperationId = null;
  setElementStatus(refs.photoTaskStatus, '');
  if (refs.quickPostPanel) refs.quickPostPanel.hidden = true;
  if (refs.photoTaskPanel) refs.photoTaskPanel.hidden = true;
  setQuickChoiceMode();
  if (refs.photoDialog?.open) refs.photoDialog.close();
  cleanupPhotoDialogState();
  isQuickSaving = false;
  setFormLocked(refs.quickPostForm, false);
  setFormLocked(refs.photoTaskForm, false);
  editingRecord = null;
  refs.form?.reset();

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

async function queueSourceDraftAfterSave(sourceText, savedRecord) {
  const recordId = savedRecord?.id;
  if (!recordId) return false;
  const existingSource = sourceDraftMap.get(recordId)?.source_text || '';
  const normalizedSource = String(sourceText ?? '').trim().replace(/\s+/g, ' ');
  const retryKey = JSON.stringify([recordId, normalizedSource]);
  if (!shouldQueueFamilySourceDraft(sourceText, existingSource)) {
    pendingSourceDraftIds.delete(retryKey);
    return false;
  }
  if (!globalThis.crypto?.randomUUID) throw new Error('원문을 안전하게 등록할 수 없는 브라우저입니다.');
  const draftId = pendingSourceDraftIds.get(retryKey) || globalThis.crypto.randomUUID();
  pendingSourceDraftIds.set(retryKey, draftId);
  const draft = await createFamilyParseDraft(sourceText, recordId, { id: draftId });
  pendingSourceDraftIds.delete(retryKey);
  sourceDraftMap.set(recordId, draft);
  parseDraftMap.set(recordId, draft);
  return true;
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
    let savedRecord;
    if (editingRecord) {
      savedRecord = await updateFamilyListing(editingRecord.id, payload);
      setFormStatus('매물 정보를 수정했습니다.', 'success');
    } else {
      savedRecord = await createFamilyListing(payload);
      setFormStatus('저장했습니다.', 'success');
    }
    try {
      const queued = await queueSourceDraftAfterSave(values.sourceText, savedRecord);
      if (queued) setFormStatus('매물을 저장했습니다. 내용은 자동으로 정리됩니다.', 'success');
    } catch (sourceError) {
      console.error('[Family listings] Automatic source queue failed', sourceError);
      editingRecord = savedRecord;
      try {
        await reloadRecords();
      } catch (reloadError) {
        console.error('[Family listings] Record reload after source queue failure failed', reloadError);
      }
      setFormStatus('매물은 저장했습니다. 원문 자동 등록만 실패했습니다. 잠시 후 저장을 다시 눌러 주세요.', 'error');
      return;
    }
    await reloadRecords();
    resetEditor({ keepStatus: true });
  } catch (error) {
    console.error('[Family listings] Save failed', error);
    const duplicate = String(error?.code || '') === '23505';
    setFormStatus(duplicate ? '같은 매물 이름이 이미 있습니다. 받은 달이나 건물 이름을 확인해 주세요.' : '저장하지 못했습니다. 잠시 후 다시 눌러 주세요.', 'error');
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
  const generation = ++decorationGeneration;
  const nextRecords = await listFamilyListings();
  if (generation !== decorationGeneration) return;
  records = nextRecords;
  renderRecords();
  void refreshRecordDecorations(generation, records.map((record) => record.id));
}

async function refreshRecordDecorations(generation, recordIds) {
  await Promise.all([loadPhotoMap(recordIds, generation), loadParseDraftMap(generation)]);
  if (generation === decorationGeneration) renderRecords();
}

async function loadPhotoMap(recordIds = records.map((record) => record.id), generation = decorationGeneration) {
  try {
    const batches = await listFamilyListingPhotoBatches(recordIds);
    const paths = batches.flatMap((batch) => Array.isArray(batch?.metadata?.private_image_paths)
      ? batch.metadata.private_image_paths
      : []);
    const signedUrls = await createAdminIntakeImageSignedUrls(paths);
    if (generation === decorationGeneration) photoMap = groupFamilyListingPhotos(batches, signedUrls);
  } catch (error) {
    console.error('[Family listings] Photo list failed', error);
    if (generation === decorationGeneration) photoMap = {};
  }
}

function parseDecorationFingerprint(statuses, sources) {
  const statusRows = [...statuses.entries()]
    .map(([recordId, draft]) => [recordId, draft.id, draft.parse_status, draft.updated_at || '', draft.parser_error || ''])
    .sort(([left], [right]) => left.localeCompare(right));
  const sourceRows = [...sources.entries()]
    .map(([recordId, draft]) => [recordId, draft.id])
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([statusRows, sourceRows]);
}

async function loadParseDraftMap(generation = decorationGeneration) {
  const requestGeneration = ++parseRequestGeneration;
  try {
    const drafts = await listFamilyParseDrafts(records.map((record) => record.id));
    const next = new Map();
    const sources = new Map();
    for (const draft of drafts) {
      if (draft.record_id && !sources.has(draft.record_id)) sources.set(draft.record_id, draft);
      if (draft.record_id && !next.has(draft.record_id) && draft.parse_status !== 'reviewed') {
        next.set(draft.record_id, draft);
      }
    }
    const changed = parseDecorationFingerprint(next, sources)
      !== parseDecorationFingerprint(parseDraftMap, sourceDraftMap);
    if (generation === decorationGeneration && requestGeneration === parseRequestGeneration) {
      parseDraftMap = next;
      sourceDraftMap = sources;
    }
    return changed && requestGeneration === parseRequestGeneration;
  } catch (error) {
    console.error('[Family listings] Organization status load failed', error);
    return false;
  }
}

function startParsePolling() {
  if (parsePollTimer) window.clearInterval(parsePollTimer);
  parsePollTimer = window.setInterval(async () => {
    if (document.hidden) return;
    const generation = decorationGeneration;
    const changed = await loadParseDraftMap(generation);
    if (changed && generation === decorationGeneration) {
      try {
        await reloadRecords();
      } catch (error) {
        console.error('[Family listings] Record refresh after automatic organization failed', error);
      }
    }
  }, 15000);
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
  const photos = photoMap[record.id] || [];
  const visiblePhotos = photos.filter((photo) => photo.url);

  const cover = document.createElement('div');
  cover.className = 'listing-card__cover';
  if (visiblePhotos.length) {
    const photoLink = document.createElement('a');
    photoLink.className = 'listing-card__cover-link';
    photoLink.href = visiblePhotos[0].url;
    photoLink.target = '_blank';
    photoLink.rel = 'noopener noreferrer';
    photoLink.setAttribute('aria-label', `${record.alias_code} 대표 사진 크게 보기`);
    const image = document.createElement('img');
    image.src = visiblePhotos[0].url;
    image.alt = `${record.neighborhood} ${record.building_keyword} 매물 사진`;
    image.loading = 'lazy';
    photoLink.appendChild(image);
    const count = document.createElement('span');
    count.className = 'listing-card__photo-count';
    count.textContent = `사진 ${photos.length}장`;
    cover.append(photoLink, count);
  } else {
    cover.classList.add('listing-card__cover--empty');
    cover.textContent = photos.length ? `사진 ${photos.length}장 · 다시 불러오는 중` : '사진이 아직 없습니다';
  }

  const top = document.createElement('div');
  top.className = 'listing-card__top';
  const title = document.createElement('h3');
  title.className = 'listing-card__title';
  title.textContent = `${record.neighborhood} ${record.building_keyword} ${record.unit_label}`;
  const badge = document.createElement('span');
  badge.className = 'listing-card__status';
  badge.textContent = statusLabel(record.status);
  top.append(title, badge);

  const price = document.createElement('p');
  price.className = 'listing-card__price';
  price.textContent = `${record.transaction_type} · ${record.price_summary || '가격 확인 필요'}`;

  const facts = document.createElement('dl');
  facts.className = 'listing-card__facts';
  appendFact(facts, '구조·층', [record.layout_summary, record.floor_summary].filter(Boolean).join(' · ') || '확인 필요');
  appendFact(facts, '입주', record.move_in_summary || '확인 필요');

  const updated = document.createElement('p');
  updated.className = 'listing-card__date';
  const updatedAt = record.updated_at ? new Date(record.updated_at) : null;
  updated.textContent = updatedAt && !Number.isNaN(updatedAt.getTime())
    ? `최근 수정 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' }).format(updatedAt)}`
    : describeIntakeYearMonth(record.intake_year_month).label;

  article.append(cover, top, price, facts, updated);

  if (record.staff_task) {
    const task = document.createElement('p');
    task.className = 'listing-card__task';
    const label = record.source_label === '현장 촬영 예정' ? '촬영할 곳' : '확인할 일';
    const fullTask = String(record.staff_task);
    const taskPreview = fullTask.length > 240 ? `${fullTask.slice(0, 240)}…` : fullTask;
    task.textContent = `${label}: ${taskPreview}`;
    article.appendChild(task);
  }

  if (visiblePhotos.length > 1) {
    const gallery = document.createElement('details');
    gallery.className = 'listing-card__gallery';
    const summary = document.createElement('summary');
    summary.textContent = `사진 ${visiblePhotos.length}장 모두 보기`;
    const grid = document.createElement('div');
    grid.className = 'listing-card__gallery-grid';
    for (const photo of visiblePhotos) {
      const link = document.createElement('a');
      link.href = photo.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = '사진 크게 보기';
      const image = document.createElement('img');
      image.src = photo.url;
      image.alt = `${record.neighborhood} ${record.building_keyword} 사진 ${photo.position}`;
      image.loading = 'lazy';
      link.appendChild(image);
      grid.appendChild(link);
    }
    gallery.append(summary, grid);
    article.appendChild(gallery);
  }

  const originalPhotos = photos.filter((photo) => photo.originalPath);
  if (originalPhotos.length) {
    const downloads = document.createElement('details');
    downloads.className = 'listing-card__original-downloads';
    const summary = document.createElement('summary');
    summary.textContent = `원본 사진 받기 (${originalPhotos.length}장)`;
    const links = document.createElement('div');
    links.className = 'listing-card__original-links';
    for (const photo of originalPhotos) {
      const extension = ['jpg', 'png', 'webp'].includes(String(photo.originalPath).split('.').pop())
        ? String(photo.originalPath).split('.').pop()
        : 'jpg';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${photo.position}번 원본 받기`;
      button.addEventListener('click', async () => {
        const label = button.textContent;
        button.disabled = true;
        button.textContent = '원본 받는 중…';
        try {
          await downloadAdminIntakeImage(
            photo.originalPath,
            `${record.alias_code}-${String(photo.position).padStart(2, '0')}.${extension}`
          );
          button.textContent = '원본 받기 완료';
        } catch (error) {
          button.textContent = error?.message || '다시 눌러주세요';
        } finally {
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = label;
          }, 2500);
        }
      });
      links.appendChild(button);
    }
    downloads.append(summary, links);
    article.appendChild(downloads);
  }

  const actions = document.createElement('div');
  actions.className = 'listing-card__actions';
  if (record.status === 'needs_info') actions.classList.add('listing-card__actions--photo-needed');
  const photoButton = document.createElement('button');
  photoButton.type = 'button';
  photoButton.className = 'listing-card__photo-action';
  photoButton.textContent = '사진 추가';
  photoButton.addEventListener('click', () => openPhotoDialog(record));
  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.dataset.copyStaff = record.id;
  shareButton.textContent = '공유하기';
  const shareStatus = document.createElement('p');
  shareStatus.className = 'listing-card__share-status';
  shareStatus.hidden = true;
  shareStatus.setAttribute('role', 'status');
  shareStatus.setAttribute('aria-live', 'polite');
  shareButton.addEventListener('click', () => shareListing(record, shareButton, shareStatus));
  actions.append(photoButton, shareButton);
  article.append(actions, shareStatus);

  const more = document.createElement('details');
  more.className = 'listing-card__more';
  const moreSummary = document.createElement('summary');
  moreSummary.textContent = '자세히 보기';
  const moreActions = document.createElement('div');
  moreActions.className = 'listing-card__more-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = '정보 수정';
  edit.addEventListener('click', () => openEditor(record));
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
  moreActions.append(edit, history);
  if (currentFamilyRole === 'owner') {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'listing-card__delete';
    deleteButton.textContent = '매물 삭제';
    deleteButton.addEventListener('click', () => archiveListing(record, deleteButton));
    moreActions.appendChild(deleteButton);
  }
  more.append(moreSummary, moreActions);

  const sourceDraft = sourceDraftMap.get(record.id);
  if (sourceDraft?.source_text) {
    const original = document.createElement('details');
    original.className = 'listing-card__original';
    const summary = document.createElement('summary');
    summary.textContent = '처음 올린 글 보기';
    const text = document.createElement('p');
    text.textContent = sourceDraft.source_text;
    original.append(summary, text);
    more.appendChild(original);
  }

  if (record.internal_notes) {
    const privateDetails = document.createElement('details');
    privateDetails.className = 'listing-card__private';
    const summary = document.createElement('summary');
    summary.textContent = '내부 메모 보기';
    const note = document.createElement('p');
    note.className = 'listing-card__internal';
    note.textContent = record.internal_notes;
    privateDetails.append(summary, note);
    more.appendChild(privateDetails);
  }
  more.appendChild(historyPanel);
  article.appendChild(more);
  return article;
}

async function archiveListing(record, button) {
  if (currentFamilyRole !== 'owner') return;
  const confirmed = window.confirm(
    `${record.alias_code}\n\n이 매물을 목록에서 삭제할까요?\n사진과 변경 이력은 복구할 수 있도록 보관됩니다.`
  );
  if (!confirmed) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '삭제 중…';
  try {
    await archiveFamilyListingAsOwner(record.id);
    await reloadRecords();
  } catch (error) {
    console.error('[Family listings] Owner archive failed', error);
    button.textContent = '삭제 실패 · 다시 시도';
    window.setTimeout(() => { button.textContent = label; }, 2500);
  } finally {
    button.disabled = false;
  }
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

async function shareListing(record, button, statusElement) {
  const confirmed = window.confirm('공유할 글과 사진에 얼굴, 연락처, 문서, 계좌·출입번호가 보이지 않는지 확인했나요?');
  if (!confirmed) return;
  const old = button.textContent;
  button.disabled = true;
  button.textContent = '공유 준비 중';
  setElementStatus(statusElement, '');
  const sourceText = sourceDraftMap.get(record.id)?.source_text || '';
  const text = buildOriginalListingShareText(record, sourceText);
  try {
    const paths = (photoMap[record.id] || []).map((photo) => photo.path).slice(0, 10);
    let files = [];
    if (navigator.share && navigator.canShare && paths.length) {
      try {
        files = await createAdminIntakeImageShareFiles(paths);
      } catch (downloadError) {
        console.error('[Family listings] Share photo download failed', downloadError);
        setElementStatus(statusElement, '사진을 불러오지 못해 글만 공유합니다.', 'error');
      }
    }
    if (navigator.share) {
      const payload = { title: `${record.neighborhood} ${record.building_keyword}`, text };
      if (files.length && navigator.canShare({ files })) payload.files = files;
      await navigator.share(payload);
      button.textContent = '공유 완료';
      if (!statusElement.dataset.state) setElementStatus(statusElement, '');
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      button.textContent = '글 복사 완료';
    } else {
      refs.copyFallback.value = text;
      refs.copyFallback.select();
      document.execCommand('copy');
      button.textContent = '복사 완료';
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[Family listings] Share failed', error);
      button.textContent = '다시 공유';
      setElementStatus(statusElement, '공유하지 못했습니다. 잠시 후 다시 눌러 주세요.', 'error');
      return;
    }
  } finally {
    button.disabled = false;
    window.setTimeout(() => { button.textContent = old; }, 1600);
  }
}

function openEditor(record = null) {
  editingRecord = record;
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
    const sourceDraft = sourceDraftMap.get(record.id);
    if (sourceDraft) {
      refs.sourceText.value = sourceDraft.source_text || '';
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
  refs.form.reset();
  refs.id.value = '';
  refs.formTitle.textContent = '새 매물 적기';
  setDefaultYearMonth();
  updateAliasPreview();
  if (!options.keepStatus) setFormStatus('');
}
