import { listExternalFeeds } from './services/backendAdapter.js';

const feedContainer = document.querySelector('[data-feed-list]');
const isEnglish = document.documentElement.lang === 'en';

initFeeds();

async function initFeeds() {
  if (!feedContainer) return;
  setLoading();
  try {
    const feeds = await listExternalFeeds({ limit: 8 });
    if (!feeds || feeds.length === 0) {
      setEmpty();
      return;
    }
    renderFeeds(feeds);
  } catch (err) {
    console.error('Feed load failed', err);
    setError();
  }
}

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
          <span>${formatDate(item.fetched_at, true)}</span>
        </div>
      </div>
    `;
    feedContainer.appendChild(card);
  });
}

function setLoading() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'Loading updates...' : '업데이트 불러오는 중...'}</p>`;
}

function setEmpty() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'No updates available yet.' : '표시할 업데이트가 없습니다.'}</p>`;
}

function setError() {
  feedContainer.innerHTML = `<p class="lr-text">${isEnglish ? 'Failed to load updates.' : '업데이트를 불러오지 못했습니다.'}</p>`;
}

function mapSource(source) {
  const map = {
    molit_policy: isEnglish ? 'MOLIT Policy' : '국토부 정책',
    korea_press: isEnglish ? 'Gov Press' : '정부 보도자료',
    hankyung_realestate: isEnglish ? 'Hankyung Real Estate' : '한국경제 부동산'
  };
  return map[source] || source || (isEnglish ? 'Update' : '업데이트');
}

function formatDate(ts, fetched = false) {
  if (!ts) return '';
  try {
    const locale = isEnglish ? 'en-US' : 'ko-KR';
    const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `${new Date(ts).toLocaleString(locale, { ...opts, timeZone: 'Asia/Seoul' })}${fetched ? (isEnglish ? ' (fetched)' : ' (업데이트)') : ''}`;
  } catch {
    return '';
  }
}
