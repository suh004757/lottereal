import { assessCorporateFit } from './utils/corporateBuildingFit.mjs';

const form = document.getElementById('corporate-fit-form');
const result = document.getElementById('corporate-fit-result');
let latestInquiryDraft = '';

const USE_LABELS = Object.freeze({
  hq: '본사·사옥',
  showroom: '브랜드 쇼룸',
  research: '연구·콘텐츠 공간',
  customer: '고객 방문형'
});

function buildInquiryDraft({ useType, parkingNeed, elevatorRequired }, assessment) {
  const parking = Math.min(999, Math.max(0, Number(parkingNeed) || 0));
  return [
    '[삼공빌딩 1차 적합성 검토]',
    `사용 목적: ${USE_LABELS[useType] || '기타'}`,
    `필요 주차: ${parking}대`,
    `엘리베이터 필수: ${elevatorRequired ? '예' : '아니오'}`,
    `검토 결과: ${assessment.status}`
  ].join('\n');
}

function renderAssessment(assessment) {
  if (!result) return;
  result.hidden = false;
  result.dataset.tone = assessment.tone;
  result.innerHTML = `
    <p class="corporate-fit-result__label">1차 결과</p>
    <h3>${assessment.status}</h3>
    <p>${assessment.summary}</p>
    <ul>${assessment.reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>
    <a href="#inquiry" data-corporate-inquiry class="lr-btn lr-btn--primary">삼공빌딩 문의하기</a>
  `;
  result.focus({ preventScroll: true });
}

if (form && result) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const fitInputs = {
      useType: data.get('useType'),
      parkingNeed: Number(data.get('parkingNeed')),
      elevatorRequired: data.get('elevatorRequired') === 'yes'
    };
    const assessment = assessCorporateFit(fitInputs);
    latestInquiryDraft = buildInquiryDraft(fitInputs, assessment);
    renderAssessment(assessment);
  });
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-corporate-inquiry]');
  if (!trigger) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('lottereal:open-inquiry', {
    detail: {
      listingId: '4b2080fa-ebc5-4363-a801-ca1be33add3e',
      listingTitle: '올림픽공원 전면 프라이빗 사옥용 삼공빌딩',
      inquiryDraft: latestInquiryDraft
    }
  }));
});
