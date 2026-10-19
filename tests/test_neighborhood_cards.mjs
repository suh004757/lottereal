import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { renderNeighborhoodCards, replaceNeighborhoodCards } from '../public/js/songpaNeighborhoodCards.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../public/Data/songpa-neighborhood-guide.v1.json', import.meta.url), 'utf8'));

test('published guide page carries the cards rendered from the current data', () => {
  const html = fs.readFileSync(new URL('../public/songpa-neighborhood-guide.html', import.meta.url), 'utf8');
  assert.equal(replaceNeighborhoodCards(html, config.neighborhoods), html,
    'run node scripts/render_neighborhood_guide.mjs after editing the neighborhood JSON');
});

test('every neighborhood gets one card with its name, summary and field checks', () => {
  const html = renderNeighborhoodCards(config.neighborhoods);
  for (const area of config.neighborhoods) {
    assert.equal(html.split(`id="area-${area.id}"`).length, 2, area.id);
    assert.ok(html.includes(area.summary), area.id);
    for (const check of area.fieldChecks) assert.ok(html.includes(check), check);
  }
});

test('card text is escaped', () => {
  const html = renderNeighborhoodCards([{ id: 'x', name: '<b>', eyebrow: '"', summary: '&', housingTypes: '', tradeoffs: ['<i>'], fieldChecks: [] }]);
  assert.ok(!html.includes('<b>') && !html.includes('<i>'));
  assert.ok(html.includes('&lt;b&gt;') && html.includes('&amp;'));
});

test('missing markers leave the page alone', () => {
  assert.equal(replaceNeighborhoodCards('<main></main>', config.neighborhoods), null);
});

test('report titles link to the guide card of every 동 they name, except 송파', async () => {
  const { neighborhoodsInTitle } = await import('../scripts/export_static_reports.mjs');
  const ids = (title) => neighborhoodsInTitle(title, config.neighborhoods).map((area) => area.id);
  assert.deepEqual(ids('삼전·석촌 빌라 엘리베이터 확인'), ['samjeon', 'seokchon']);
  assert.deepEqual(ids('송파 실수요자 확인사항'), []);
  assert.deepEqual(ids('서울 아파트 지수'), []);
  for (const area of config.neighborhoods.filter((item) => item.id !== 'songpa')) {
    assert.deepEqual(ids(`${area.name} 계약 확인`), [area.id]);
  }
});
