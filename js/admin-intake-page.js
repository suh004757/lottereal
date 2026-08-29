import { buildAdminIntakePayload, detectSensitiveDetails } from './adminIntake.mjs';
import { saveAdminIntakeDraft } from './services/adminIntakeAdapter.js';
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
const history = document.getElementById('chatHistory');

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

function chooseType(type) {
  const isListing = type === 'listing';
  typeInput.value = type;
  choices.hidden = true;
  form.hidden = false;
  transactionField.hidden = !isListing;
  sourceField.hidden = isListing;
  messageLabel.textContent = isListing ? '매물 내용을 편하게 적어주세요' : '쓰고 싶은 글의 핵심을 적어주세요';
  messageInput.placeholder = isListing
    ? '예: 삼전동 원룸 월세, 보증금 1천/월 70, 3층, 즉시 입주…'
    : '예: 잠실 전세대출 금리가 세입자에게 미치는 영향을 공식 자료로 설명해줘…';
  addBubble(isListing ? '매물 등록할게요.' : '글을 작성할게요.', 'user');
  addBubble(isListing
    ? '카톡이나 매물 앱에 적은 내용을 그대로 붙여주세요. 모르는 값은 추측하지 않고 함께 확인할게요.'
    : '주제와 원하는 방향을 적어주세요. 출처를 확인한 뒤 검토용 글로 준비할게요.');
  messageInput.focus();
}

function resetForm() {
  form.reset();
  form.hidden = true;
  choices.hidden = false;
  typeInput.value = '';
  statusEl.hidden = true;
  while (history.children.length > 1) history.lastElementChild.remove();
}

document.getElementById('intakeListingBtn').addEventListener('click', () => chooseType('listing'));
document.getElementById('intakeReportBtn').addEventListener('click', () => chooseType('report'));
document.getElementById('resetIntakeBtn').addEventListener('click', resetForm);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveBtn.disabled = true;
  showStatus('비공개 초안으로 저장하는 중입니다.');
  try {
    const user = await getCurrentSessionUser();
    if (!user) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if (user.app_metadata?.role !== 'admin') throw new Error('관리자 권한이 확인되지 않습니다.');

    const values = Object.fromEntries(new FormData(form).entries());
    const payload = buildAdminIntakePayload(values);
    payload.metadata.submitted_by = user.id;
    const saved = await saveAdminIntakeDraft(payload);
    if (!saved?.id) throw new Error('백엔드 저장 결과를 확인할 수 없습니다.');

    const flags = detectSensitiveDetails(values.text);
    const warning = flags.length ? ' 개인정보 가능 항목이 있어 공개 전 제거 여부를 확인합니다.' : '';
    form.hidden = true;
    addBubble('검토 대기 초안으로 저장했어요.', 'user');
    addBubble(`접수 완료. 이 내용은 공개되지 않았습니다.${warning} 함께 확인한 뒤 승인된 내용만 올릴게요.`);
    showStatus(`접수번호 ${String(saved.id).slice(0, 8)} · 검토 대기`, false);
  } catch (error) {
    showStatus(error?.message || '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
    if (/로그인/.test(error?.message || '')) {
      window.setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    }
  } finally {
    saveBtn.disabled = false;
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
