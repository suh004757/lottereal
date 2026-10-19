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
