/**
 * FeedsWidget.js - 외부 피드 위젯
 * 뉴스, 정책, 부동산 정보를 표시하는 위젯을 관리합니다.
 */

import { listExternalFeeds } from './services/backendAdapter.js';

// DOM 요소 참조
const feedContainer = document.querySelector('[data-feed-list]');
const updatedEl = document.querySelector('[data-feed-updated]');
const isEnglish = document.documentElement.lang === 'en';

/**
 * 피드 위젯을 초기화합니다.
 */
async function initFeeds() {
  if (!feedContainer) return;
  setLoading();
  try {
    const feeds = await listExternalFeeds({ limit: 8 });
    if (!feeds || feeds.length === 0) {
      setEmpty();
      setUpdatedText(null);
      return;
    }
    renderFeeds(feeds);
    setUpdatedText(getLatestTs(feeds));
  } catch (err) {
    console.error('Feed load failed', err);
    setError();
    setUpdatedText(null);
  }
}

/**
 * 피드 목록을 렌더링합니다.
 * @param {Array} feeds - 피드 데이터 배열
 */
function renderFeeds(feeds) {
  feedContainer.innerHTML = '';
  feeds.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'lr-card lr-card--listing';
    card.innerHTML = `
      <div class="lr-card__body">
        <p class="lr-badge">${mapSource(item.source)}</p>
        <h3><a href="${item.url}" target="_blank" rel="noreferrer">${item.title || ''}</a></h3>
        <p class="lr-text">${item.summary || ''}</p>
        <div class="lr-card__meta">
          <span>${formatDate(item.published_at)}</span>
        </div>
      </div>
    `;
    feedContainer.appendChild(card);
  });
}

/**
 * 로딩 상태를 표시합니다.
 */
function setLoading() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'Loading updates...' : '업데이트 불러오는 중...'}</p>`;
}

/**
 * 빈 상태를 표시합니다.
 */
function setEmpty() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'No updates available yet.' : '표시할 업데이트가 없습니다.'}</p>`;
}

/**
 * 에러 상태를 표시합니다.
 */
function setError() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'Failed to load updates.' : '업데이트를 불러오지 못했습니다.'}</p>`;
}

/**
 * 소스 이름을 사용자 친화적인 레이블로 매핑합니다.
 * @param {string} source - 소스 식별자
 * @returns {string} 매핑된 레이블
 */
function mapSource(source) {
  const map = {
    molit_policy: isEnglish ? 'MOLIT Policy' : '국토부 정책',
    korea_press: isEnglish ? 'Gov Press' : '정부 보도자료',
    hankyung_realestate: isEnglish ? 'Hankyung Real Estate' : '한국경제 부동산'
  };
  return map[source] || source || (isEnglish ? 'Update' : '업데이트');
}

/**
 * 날짜를 로케일에 맞게 포맷팅합니다.
 * @param {string} ts - 타임스탬프
 * @returns {string} 포맷팅된 날짜 문자열
 */
function formatDate(ts) {
  if (!ts) return '';
  try {
    const locale = isEnglish ? 'en-US' : 'ko-KR';
    const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(ts).toLocaleString(locale, { ...opts, timeZone: 'Asia/Seoul' });
  } catch {
    return '';
  }
}

/**
 * 피드 배열에서 최신 타임스탬프를 찾습니다.
 * @param {Array} feeds - 피드 배열
 * @returns {string|null} 최신 타임스탬프 또는 null
 */
function getLatestTs(feeds) {
  let latest = null;
  feeds.forEach((f) => {
    const ts = f.fetched_at || f.published_at;
    if (ts && (!latest || new Date(ts) > new Date(latest))) latest = ts;
  });
  return latest;
}

/**
 * 업데이트 시간을 표시합니다.
 * @param {string} ts - 타임스탬프
 */
function setUpdatedText(ts) {
  if (!updatedEl) return;
  if (!ts) {
    updatedEl.textContent = '';
    return;
  }
  const label = isEnglish ? 'Updated: ' : '업데이트: ';
  updatedEl.textContent = label + formatDate(ts) + ' KST';
}

// 초기화 실행
initFeeds();
