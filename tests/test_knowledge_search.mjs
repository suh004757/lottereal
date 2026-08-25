import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeIndex,
  searchKnowledge,
  getOntologySuggestions,
  selectCommunityPulse
} from '../js/knowledgeSearch.mjs';

const reports = [
  {
    slug: 'mold-case',
    title: '전월세집 곰팡이, 집주인이 고쳐야 하나요?',
    summary: '결로와 누수의 원인, 임대인과 임차인의 수선 책임을 정리했습니다.',
    report_md: `## 먼저 볼 내용\n외벽 누수나 단열 문제인지 환기 부족인지 확인해야 합니다.\n\n## 임대인·임차인이 각각 준비할 증거\n사진, 습도 기록, 수리 요청 문자와 견적을 준비합니다.\n\n## 대응 순서\n임대인에게 알리고 전문 점검 뒤 분쟁조정을 검토합니다.`,
    evidence_json: [{ name: '국가법령정보센터 민법', url: 'https://www.law.go.kr/example', coverage: '임대인의 수선의무' }],
    metadata: { content_type: 'dispute_case', content_topics: ['곰팡이', '결로', '임대인 수선의무'], as_of: '2026-08-25' },
    updated_at: '2026-08-25T00:00:00Z'
  },
  {
    slug: 'rate-report',
    title: '서울 부동산 시장에서 금리와 대출을 함께 보는 법',
    summary: '금리와 주택담보대출 변화가 송파 매수 여건에 미치는 영향을 정리했습니다.',
    report_md: `## 확인된 흐름\n대출금리와 가계대출 규제를 함께 확인해야 합니다.\n\n## 송파·잠실에서 볼 점\n실거래와 자금조달 조건을 구분해서 봅니다.`,
    evidence_json: [{ name: '한국은행', url: 'https://www.bok.or.kr/', coverage: '기준금리' }],
    metadata: { content_type: 'market_report', content_topics: ['금리', '대출', '송파'] },
    updated_at: '2026-08-24T00:00:00Z'
  }
];

test('ontology aliases connect everyday landlord and repair language to the mold dispute', () => {
  const index = buildKnowledgeIndex(reports);
  const result = searchKnowledge(index, '집주인이 곰팡이 수리를 안 해줘요');

  assert.equal(result.matches[0].slug, 'mold-case');
  assert.ok(result.detectedLabels.some((item) => item.id === 'mold'));
  assert.ok(result.detectedLabels.some((item) => item.id === 'landlord'));
  assert.ok(result.matches[0].passages.some((item) => item.text.includes('수리 요청 문자')));
  assert.equal(result.sources[0].url, 'https://www.law.go.kr/example');
});

test('market questions retrieve market reports instead of only dispute cases', () => {
  const index = buildKnowledgeIndex(reports);
  const result = searchKnowledge(index, '금리가 송파 집 살 때 어떤 영향을 줘?');

  assert.equal(result.matches[0].slug, 'rate-report');
  assert.ok(result.detectedLabels.some((item) => item.id === 'interest-rate'));
});

test('a newly published report is searchable without changing the ontology code', () => {
  const future = {
    slug: 'brokerage-fee-case',
    title: '중개보수는 언제 지급해야 하나요?',
    summary: '중개수수료 지급 시점과 분쟁 자료를 정리했습니다.',
    report_md: '## 먼저 볼 내용\n중개계약과 거래계약의 성립 여부를 먼저 확인합니다.',
    evidence_json: [],
    metadata: { content_type: 'dispute_case', content_topics: ['중개보수', '중개수수료'] },
    updated_at: '2026-08-26T00:00:00Z'
  };
  const result = searchKnowledge(buildKnowledgeIndex([...reports, future]), '복비 언제 내나요?');

  assert.equal(result.matches[0].slug, 'brokerage-fee-case');
});

test('unknown questions return an honest empty state', () => {
  const result = searchKnowledge(buildKnowledgeIndex(reports), '반려견 미용 예약');
  assert.equal(result.matches.length, 0);
  assert.equal(result.sources.length, 0);
});

test('suggestions expose plain Korean example questions', () => {
  const suggestions = getOntologySuggestions();
  assert.ok(suggestions.includes('곰팡이가 생기면 집주인이 고쳐야 하나요?'));
  assert.ok(suggestions.includes('금리와 대출이 집값에 어떤 영향을 주나요?'));
});


test('community pulse shows recent viewed questions instead of stale or zero-view content', () => {
  const pulseReports = [
    { ...reports[0], slug: 'recent-three', view_count: 3, created_at: '2026-08-24T00:00:00Z' },
    { ...reports[1], slug: 'recent-nine', view_count: 9, created_at: '2026-08-23T00:00:00Z' },
    { ...reports[0], slug: 'recent-zero', view_count: 0, created_at: '2026-08-25T00:00:00Z' },
    { ...reports[1], slug: 'stale-hundred', view_count: 100, created_at: '2025-12-01T00:00:00Z' }
  ];
  const index = buildKnowledgeIndex(pulseReports);
  const pulse = selectCommunityPulse(index, { now: '2026-08-26T00:00:00Z', maxAgeDays: 120, limit: 3 });

  assert.deepEqual(pulse.map((item) => item.slug), ['recent-nine', 'recent-three']);
});


test('community pulse default window requires two finite whole views and valid publication dates', () => {
  const pulseReports = [
    { ...reports[0], slug: 'tie-older', view_count: 2.9, created_at: '2026-08-20T00:00:00Z' },
    { ...reports[1], slug: 'tie-newer', view_count: 2, created_at: '2026-08-21T00:00:00Z' },
    { ...reports[0], slug: 'one-view', view_count: 1, created_at: '2026-08-25T00:00:00Z' },
    { ...reports[0], slug: 'boundary', view_count: 2, created_at: '2026-06-27T00:00:00Z' },
    { ...reports[0], slug: 'outside', view_count: 99, created_at: '2026-06-26T23:59:59Z' },
    { ...reports[0], slug: 'future', view_count: 99, created_at: '2026-08-27T00:00:00Z' },
    { ...reports[0], slug: 'bad-date', view_count: 99, created_at: 'not-a-date' },
    { ...reports[0], slug: 'infinite', view_count: Infinity, created_at: '2026-08-24T00:00:00Z' }
  ];
  const index = buildKnowledgeIndex(pulseReports);
  const pulse = selectCommunityPulse(index, { now: '2026-08-26T00:00:00Z', limit: 6 });

  assert.deepEqual(pulse.map((item) => item.slug), ['tie-newer', 'tie-older', 'boundary']);
  assert.equal(index.documents.find((item) => item.slug === 'tie-older').viewCount, 2);
  assert.equal(index.documents.find((item) => item.slug === 'infinite').viewCount, 0);
});
