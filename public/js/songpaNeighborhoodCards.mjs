// Static cards for the seven neighborhoods in Data/songpa-neighborhood-guide.v1.json.
// scripts/render_neighborhood_guide.mjs writes them into songpa-neighborhood-guide.html
// so crawlers that skip JavaScript (Naver) read each 동's description.
export const CARDS_START = '<!-- NEIGHBORHOOD_CARDS_START -->';
export const CARDS_END = '<!-- NEIGHBORHOOD_CARDS_END -->';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function listItems(items = []) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

export function renderNeighborhoodCards(neighborhoods = []) {
  return neighborhoods.map((area) => (
    `<article class="nh-area-card" id="area-${escapeHtml(area.id)}">`
    + `<p class="nh-area-card__eyebrow">${escapeHtml(area.eyebrow)}</p>`
    + `<h3>${escapeHtml(area.name)}</h3>`
    + `<p>${escapeHtml(area.summary)}</p>`
    + `<p class="nh-area-card__types"><strong>주거 유형</strong> ${escapeHtml(area.housingTypes)}</p>`
    + `<h4>먼저 알아둘 점</h4><ul>${listItems(area.tradeoffs)}</ul>`
    + `<h4>현장에서 확인할 것</h4><ul>${listItems(area.fieldChecks)}</ul>`
    + '</article>'
  )).join('');
}

export function replaceNeighborhoodCards(html, neighborhoods) {
  const start = html.indexOf(CARDS_START);
  const end = html.indexOf(CARDS_END);
  if (start < 0 || end <= start) return null;
  return html.slice(0, start + CARDS_START.length) + renderNeighborhoodCards(neighborhoods) + html.slice(end);
}
