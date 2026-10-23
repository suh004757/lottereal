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

test('area-card deep links clear the sticky mobile and desktop navigation', () => {
  const css = fs.readFileSync(new URL('../public/css/songpa-neighborhood-guide.css', import.meta.url), 'utf8');
  assert.match(css, /\.nh-area-card\s*\{[^}]*scroll-margin-top:\s*(?:var\(|\d)/s);
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

test('report neighborhood matching distinguishes legal-dong names and metadata aliases', async () => {
  const { neighborhoodsInTitle } = await import('../scripts/export_static_reports.mjs');
  const ids = (title, metadata = {}) => neighborhoodsInTitle(title, config.neighborhoods, metadata).map((area) => area.id);
  assert.deepEqual(ids('삼전·석촌 빌라 엘리베이터 확인'), ['samjeon', 'seokchon']);
  assert.deepEqual(ids('송파동 빌라 계약 확인'), ['songpa']);
  assert.deepEqual(ids('송파구 실수요자 확인사항'), []);
  assert.deepEqual(ids('서울 아파트 지수'), []);
  assert.deepEqual(ids('생활권 계약 확인', { legal_dong: '송파동' }), ['songpa']);
  assert.deepEqual(ids('생활권 계약 확인', { neighborhood_aliases: ['문정법조단지'] }), ['munjeong']);
  assert.deepEqual(ids('잠실새내역 인근 확인'), [], 'a longer place name must not match a bare stem');
  for (const area of config.neighborhoods) {
    assert.deepEqual(ids(`${area.name} 계약 확인`), [area.id]);
  }
});

test('report pages link their matching topic hubs except the breadcrumb section', async () => {
  const { hubLinksForReport } = await import('../scripts/export_static_reports.mjs');
  const paths = (report) => hubLinksForReport(report).map((hub) => hub.path);
  const songpaLease = { title: '송파 전세 계약 전 확인', summary: '', metadata: { region: 'songpa', content_type: 'legal_checklist' } };
  assert.ok(paths(songpaLease).includes('songpa-market-report.html'));
  assert.ok(!paths(songpaLease).includes('report.html'));
  const dispute = { title: '누수 분쟁 보증금', summary: '', metadata: { region: 'songpa', content_type: 'dispute_case' } };
  assert.ok(!paths(dispute).includes('disputes.html'), 'disputes hub is already the breadcrumb section');
  assert.ok(paths({ title: '부산 상가', summary: '', metadata: {} }).length === 0);
});
