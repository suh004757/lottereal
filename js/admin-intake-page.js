import { buildAdminIntakePayload, detectSensitiveDetails } from './adminIntake.mjs';
import { saveAdminIntakeDraft, finalizeAdminIntakeImages } from './services/adminIntakeAdapter.js';
import { uploadAdminIntakeImages, createAdminIntakeThumbnail } from './services/adminIntakeImageAdapter.js';
import { validateAdminIntakeImages, attachPendingImageManifest } from './adminIntakeImageRules.mjs';
import { getCurrentSessionUser, signOutAdmin } from './services/authService.js';

const form = document.getElementById('intakeForm');
const choices = document.getElementById('intentChoices');
const typeInput = document.getElementById('intakeType');
const messageInput = document.getElementById('intakeMessage');
const messageLabel = document.getElementById('messageLabel');
const transactionField = document.getElementById('transactionField');
const sourceField = document.getElementById('sourceField');
const statusEl = document.getElementById('intakeStatus');
const saveBtn = document.getElementById('saveIntakeBtn');
const resetBtn = document.getElementById('resetIntakeBtn');
const history = document.getElementById('chatHistory');
const imageSection = document.getElementById('intakeImageSection');
const imageDropzone = document.getElementById('intakeImageDropzone');
const imageInput = document.getElementById('intakeImages');
const imageSummary = document.getElementById('intakeImageSummary');
const imagePreview = document.getElementById('intakeImagePreview');
const successActions = document.getElementById('intakeSuccessActions');
let selectedImages = [];
let selectingImages = false;
let isSubmitting = false;
let pendingDraftContext = null;

function addBubble(text, side = 'assistant') {
  const row = document.createElement('div');
  row.className = `chat-row chat-row--${side}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  history.appendChild(row);
}

function showStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.classList.toggle('intake-status--error', error);
}

async function addSelectedImages(files) {
  if (isSubmitting) {
    showStatus('초안을 저장 중입니다. 완료된 뒤 사진을 변경해 주세요.', true);
    return;
  }
  if (selectingImages) {
    showStatus('사진 미리보기를 준비 중입니다. 잠시만 기다려 주세요.', true);
    return;
  }
  if (pendingDraftContext?.locked) {
    showStatus('저장된 초안의 사진은 재시도 중 변경할 수 없습니다. 처음부터 다시 작성해 주세요.', true);
    return;
  }
  const createdPreviewUrls = [];
  const saveWasDisabled = saveBtn.disabled;
  const resetWasDisabled = resetBtn.disabled;
  selectingImages = true;
  saveBtn.disabled = true;
  resetBtn.disabled = true;
  renderSelectedImages();
  try {
    const incoming = Array.from(files || []);
    const seenFiles = new Set(selectedImages.map(({ file }) => file));
    const uniqueByIdentity = incoming.filter((file) => {
      if (seenFiles.has(file)) return false;
      seenFiles.add(file);
      return true;
    });
    const combined = validateAdminIntakeImages([...selectedImages.map(({ file }) => file), ...uniqueByIdentity]);
    showStatus(`사진 ${uniqueByIdentity.length}장의 가벼운 미리보기를 준비하는 중입니다.`);
    const nextImages = [];
    for (const file of combined) {
      const existing = selectedImages.find((entry) => entry.file === file);
      if (existing) {
        nextImages.push(existing);
      } else {
        const previewUrl = await createAdminIntakeThumbnail(file);
        createdPreviewUrls.push(previewUrl);
        nextImages.push({ file, previewUrl });
      }
    }
    selectedImages = nextImages;
    createdPreviewUrls.length = 0;
    renderSelectedImages();
    statusEl.hidden = true;
  } catch (error) {
    createdPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    showStatus(error?.message || '사진을 추가하지 못했습니다.', true);
  } finally {
    selectingImages = false;
    saveBtn.disabled = saveWasDisabled;
    resetBtn.disabled = resetWasDisabled;
    renderSelectedImages();
    imageInput.value = '';
  }
}

function renderSelectedImages() {
  imagePreview.replaceChildren();
  imageSummary.textContent = selectedImages.length
    ? `사진 ${selectedImages.length}장 선택됨 · 저장할 때 비공개로 업로드합니다.`
    : '선택한 사진 없음';
  selectedImages.forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'image-preview-item';
    const image = document.createElement('img');
    image.src = entry.previewUrl;
    image.alt = `현장 사진 ${index + 1}`;
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'image-preview-remove';
    remove.setAttribute('aria-label', `현장 사진 ${index + 1} 삭제`);
    remove.textContent = '×';
    remove.disabled = selectingImages || isSubmitting || Boolean(pendingDraftContext?.locked);
    remove.addEventListener('click', () => {
      if (selectingImages || isSubmitting || pendingDraftContext?.locked) return;
      URL.revokeObjectURL(entry.previewUrl);
      selectedImages.splice(index, 1);
      renderSelectedImages();
    });
    item.append(image, number, remove);
    imagePreview.appendChild(item);
  });
}

function clearSelectedImages() {
  selectedImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
  selectedImages = [];
  renderSelectedImages();
}

function setFormControlsDisabled(disabled) {
  form.querySelectorAll('textarea, select, input:not([type="hidden"])').forEach((element) => {
    element.disabled = disabled;
  });
  imageDropzone.setAttribute('aria-disabled', String(disabled));
  imageDropzone.tabIndex = disabled ? -1 : 0;
  renderSelectedImages();
}

function setDraftFieldsLocked(locked) {
  pendingDraftContext && (pendingDraftContext.locked = locked);
  setFormControlsDisabled(locked);
}

function chooseType(type) {
  if (isSubmitting) {
    showStatus('초안을 저장 중입니다. 완료될 때까지 기다려 주세요.', true);
    return;
  }
  const draftId = globalThis.crypto?.randomUUID?.();
  if (!draftId) {
    showStatus('이 브라우저에서는 안전한 초안 식별자를 만들 수 없습니다. 브라우저를 업데이트해 주세요.', true);
    return;
  }
  pendingDraftContext = {
    id: draftId,
    now: new Date(),
    nonce: draftId.slice(0, 8),
    locked: false,
    payload: null,
    files: null
  };
  const isListing = type === 'listing';
  successActions.hidden = true;
  typeInput.value = type;
  choices.hidden = true;
  form.hidden = false;
  transactionField.hidden = !isListing;
  sourceField.hidden = isListing;
  imageSection.hidden = !isListing;
  messageLabel.textContent = isListing ? '매물 내용을 편하게 적어주세요' : '쓰고 싶은 글의 핵심을 적어주세요';
  messageInput.placeholder = isListing
    ? '예: 삼전동 원룸 월세, 보증금 1천/월 70, 3층, 즉시 입주…'
    : '예: 잠실 전세대출 금리가 세입자에게 미치는 영향을 공식 자료로 설명해줘…';
  addBubble(isListing ? '매물 등록할게요.' : '글을 작성할게요.', 'user');
  addBubble(isListing
    ? '카톡이나 매물 앱에 적은 내용을 그대로 붙이고, 현장 사진은 끌어놓거나 한꺼번에 선택하세요. 모르는 값은 추측하지 않고 함께 확인할게요.'
    : '주제와 원하는 방향을 적어주세요. 출처를 확인한 뒤 검토용 글로 준비할게요.');
  messageInput.focus();
}

function resetForm() {
  if (isSubmitting) {
    showStatus('초안을 저장 중입니다. 완료될 때까지 기다려 주세요.', true);
    return false;
  }
  form.reset();
  setDraftFieldsLocked(false);
  form.hidden = true;
  choices.hidden = false;
  typeInput.value = '';
  pendingDraftContext = null;
  imageSection.hidden = true;
  successActions.hidden = true;
  clearSelectedImages();
  statusEl.hidden = true;
  while (history.children.length > 1) history.lastElementChild.remove();
  return true;
}

document.getElementById('intakeListingBtn').addEventListener('click', () => chooseType('listing'));
document.getElementById('intakeReportBtn').addEventListener('click', () => chooseType('report'));
resetBtn.addEventListener('click', resetForm);
document.getElementById('newListingIntakeBtn').addEventListener('click', () => {
  if (!resetForm()) return;
  chooseType('listing');
});
imageDropzone.addEventListener('click', () => {
  if (!isSubmitting && !pendingDraftContext?.locked) imageInput.click();
});
imageDropzone.addEventListener('keydown', (event) => {
  if (!isSubmitting && !pendingDraftContext?.locked && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    imageInput.click();
  }
});
imageInput.addEventListener('change', () => addSelectedImages(imageInput.files));
['dragenter', 'dragover'].forEach((name) => imageDropzone.addEventListener(name, (event) => {
  event.preventDefault();
  imageDropzone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach((name) => imageDropzone.addEventListener(name, (event) => {
  event.preventDefault();
  imageDropzone.classList.remove('is-dragging');
}));
imageDropzone.addEventListener('drop', (event) => addSelectedImages(event.dataTransfer?.files));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting) return;
  const submittedValues = Object.fromEntries(new FormData(form).entries());
  isSubmitting = true;
  saveBtn.disabled = true;
  resetBtn.disabled = true;
  setFormControlsDisabled(true);
  let savedDraftId = null;
  showStatus('비공개 초안을 먼저 저장하는 중입니다.');
  try {
    const user = await getCurrentSessionUser();
    if (!user) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if (user.app_metadata?.role !== 'admin') throw new Error('관리자 권한이 확인되지 않습니다.');
    if (!pendingDraftContext?.id) throw new Error('초안 식별자를 확인할 수 없습니다. 처음부터 다시 작성해 주세요.');

    if (!pendingDraftContext.payload) {
      let payload = buildAdminIntakePayload(submittedValues, {
        now: pendingDraftContext.now,
        nonce: pendingDraftContext.nonce
      });
      payload.id = pendingDraftContext.id;
      payload.metadata.submitted_by = user.id;
      const files = selectedImages.map(({ file }) => file);
      if (submittedValues.type === 'listing' && files.length) {
        payload = attachPendingImageManifest(payload, {
          userId: user.id,
          draftId: pendingDraftContext.id,
          imageCount: files.length
        });
      }
      pendingDraftContext.payload = payload;
      pendingDraftContext.files = files;
    }

    const payload = pendingDraftContext.payload;
    const files = pendingDraftContext.files || [];
    const saved = await saveAdminIntakeDraft(payload);
    if (!saved?.id) throw new Error('백엔드 저장 결과를 확인할 수 없습니다.');
    savedDraftId = saved.id;
    setDraftFieldsLocked(true);

    let uploadedPaths = [];
    if (files.length) {
      showStatus(`초안 ${String(saved.id).slice(0, 8)} 저장됨 · 현장 사진 0/${files.length}장 업로드 준비`);
      uploadedPaths = await uploadAdminIntakeImages(files, {
        userId: user.id,
        batchId: saved.id,
        onProgress: ({ completed, total }) => showStatus(`초안 저장됨 · 현장 사진 ${completed}/${total}장 비공개 업로드 중…`)
      });
      showStatus('사진 업로드 완료 · 초안 첨부 상태를 확인하는 중입니다.');
      await finalizeAdminIntakeImages(saved.id, uploadedPaths);
    }

    const imageCount = uploadedPaths.length;
    const flags = detectSensitiveDetails(payload.report_md);
    const warning = flags.length ? ' 개인정보 가능 항목이 있어 공개 전 제거 여부를 확인합니다.' : '';
    form.hidden = true;
    successActions.hidden = false;
    addBubble(`검토 대기 초안으로 저장했어요.${imageCount ? ` 현장 사진 ${imageCount}장도 비공개로 첨부했습니다.` : ''}`, 'user');
    addBubble(`접수 완료. 이 내용은 공개되지 않았습니다.${warning} 함께 확인한 뒤 승인된 내용만 올릴게요.`);
    showStatus(`접수번호 ${String(saved.id).slice(0, 8)} · 검토 대기`, false);
    pendingDraftContext = null;
    clearSelectedImages();
  } catch (error) {
    const completed = Number(error?.completedPaths?.length || 0);
    if (savedDraftId || pendingDraftContext?.locked) {
      const id = String(savedDraftId || pendingDraftContext.id).slice(0, 8);
      showStatus(`초안 ${id}은 비공개로 보존됐습니다.${completed ? ` 사진 ${completed}장은 초안 경로에 보존됐습니다.` : ''} 같은 화면에서 다시 저장하면 안전하게 이어서 처리합니다.`, true);
    } else {
      showStatus(error?.message || '저장 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요.', true);
    }
    if (/로그인/.test(error?.message || '')) {
      window.setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    }
  } finally {
    isSubmitting = false;
    if (!savedDraftId && !pendingDraftContext?.locked) setFormControlsDisabled(false);
    saveBtn.disabled = false;
    resetBtn.disabled = false;
    renderSelectedImages();
  }
});

(async function guardAdmin() {
  const user = await getCurrentSessionUser();
  if (!user) {
    window.location.replace('login.html');
    return;
  }
  if (user.app_metadata?.role !== 'admin') {
    await signOutAdmin();
    document.body.textContent = '관리자 권한이 없습니다.';
  }
})();
