const ONTOLOGY = [
  { id: 'mold', dimension: 'issue', label: '곰팡이·결로', aliases: ['곰팡이', '결로', '습기', '단열'] },
  { id: 'leak', dimension: 'issue', label: '누수', aliases: ['누수', '물이 새', '천장 물', '배관', '방수'] },
  { id: 'repair', dimension: 'issue', label: '수선·수리', aliases: ['수선', '수리', '고쳐', '보일러', '도배'] },
  { id: 'deposit-return', dimension: 'issue', label: '보증금 반환', aliases: ['보증금', '전세금', '반환', '돌려받', '안 돌려'] },
  { id: 'lease-registration', dimension: 'issue', label: '임차권등기', aliases: ['임차권등기', '임차권 등기', '등기명령', '전출', '이사해도'] },
  { id: 'down-payment', dimension: 'issue', label: '계약금·가계약금', aliases: ['계약금', '가계약금', '가계약', '예약금'] },
  { id: 'restoration', dimension: 'issue', label: '원상복구', aliases: ['원상복구', '원상 회복', '퇴거 수리', '도배비'] },
  { id: 'brokerage-fee', dimension: 'issue', label: '중개보수', aliases: ['중개보수', '중개 수수료', '중개수수료', '복비'] },
  { id: 'renewal', dimension: 'issue', label: '계약갱신', aliases: ['계약갱신', '갱신요구', '묵시적 갱신', '재계약'] },
  { id: 'interest-rate', dimension: 'market', label: '금리', aliases: ['금리', '기준금리', '대출이자', '이자'] },
  { id: 'loan', dimension: 'market', label: '대출·자금', aliases: ['대출', '주담대', '담보대출', '자금조달', 'dsr', 'ltv'] },
  { id: 'supply', dimension: 'market', label: '공급·입주', aliases: ['공급', '입주 물량', '입주물량', '분양', '착공'] },
  { id: 'reconstruction', dimension: 'market', label: '재건축·정비사업', aliases: ['재건축', '재개발', '정비사업', '리모델링'] },
  { id: 'tax', dimension: 'market', label: '세금', aliases: ['세금', '양도세', '취득세', '보유세', '종부세'] },
  { id: 'transaction', dimension: 'market', label: '매매·실거래', aliases: ['매매', '매수', '매도', '집값', '실거래', '거래량', '아파트값'] },
  { id: 'jeonse', dimension: 'market', label: '전세', aliases: ['전세', '전세가', '전세가격'] },
  { id: 'monthly-rent', dimension: 'market', label: '월세', aliases: ['월세', '차임', '임대료'] },
  { id: 'landlord', dimension: 'party', label: '임대인·집주인', aliases: ['임대인', '집주인', '소유자'] },
  { id: 'tenant', dimension: 'party', label: '임차인·세입자', aliases: ['임차인', '세입자', '전세 세입자', '월세 세입자'] },
  { id: 'buyer', dimension: 'party', label: '매수인', aliases: ['매수인', '사는 사람', '집 살'] },
  { id: 'seller', dimension: 'party', label: '매도인', aliases: ['매도인', '파는 사람', '집 팔'] },
  { id: 'broker', dimension: 'party', label: '공인중개사', aliases: ['공인중개사', '중개사', '부동산 사장'] },
  { id: 'before-contract', dimension: 'stage', label: '계약 전', aliases: ['계약 전', '계약하기 전', '서명 전'] },
  { id: 'during-occupancy', dimension: 'stage', label: '거주 중', aliases: ['거주 중', '살고 있는데', '사는 중'] },
  { id: 'contract-end', dimension: 'stage', label: '계약 종료', aliases: ['계약 종료', '계약 만료', '나갈 때', '퇴거', '이사'] },
  { id: 'evidence', dimension: 'action', label: '증거 준비', aliases: ['증거', '사진', '문자', '내용증명', '계약서', '등기부', '견적'] },
  { id: 'mediation', dimension: 'action', label: '분쟁조정', aliases: ['분쟁조정', '조정위원회', '조정 신청', '합의'] },
  { id: 'songpa', dimension: 'region', label: '송파·잠실', aliases: ['송파', '잠실', '삼전', '석촌'] }
];

const STOP_WORDS = new Set([
  '어떤', '어떻게', '언제', '왜', '무엇', '뭐가', '해요', '하나요', '인가요',
  '있나요', '알려줘', '관련', '대한', '그리고', '그런데', '경우', '제가', '우리',
  '때는', '집을', '집이', '하면', '해야', '되는지', '됩니다'
]);

const SUGGESTIONS = [
  '곰팡이가 생기면 집주인이 고쳐야 하나요?',
  '보증금을 못 받은 채 이사해도 되나요?',
  '가계약금은 언제 돌려받을 수 있나요?',
  '누수 수리비는 누가 부담하나요?',
  '나갈 때 도배비를 내야 하나요?',
  '금리와 대출이 집값에 어떤 영향을 주나요?'
];

export function buildKnowledgeIndex(reports = []) {
  const documents = reports
    .filter((report) => report && report.slug && report.title)
    .map((report) => {
      const metadata = report.metadata && typeof report.metadata === 'object' ? report.metadata : {};
      const topics = Array.isArray(metadata.content_topics) ? metadata.content_topics.map(String) : [];
      const reportBody = String(report.report_md || report.content || '');
      const searchableText = [report.title, report.summary, topics.join(' '), reportBody]
        .filter(Boolean)
        .join('\n');
      return {
        id: report.id || report.slug,
        slug: String(report.slug),
        title: String(report.title),
        summary: String(report.summary || ''),
        report_md: reportBody,
        evidence_json: normalizeSources(report.evidence_json || report.evidence),
        metadata,
        topics,
        contentType: String(metadata.content_type || 'market_report'),
        updatedAt: report.updated_at || report.created_at || metadata.as_of || '',
        labels: detectLabels(searchableText),
        normalizedTitle: normalizeText(report.title),
        normalizedSummary: normalizeText(report.summary || ''),
        normalizedTopics: normalizeText(topics.join(' ')),
        normalizedBody: normalizeText(reportBody),
        passages: splitMarkdownIntoPassages(reportBody, report.summary || '')
      };
    });

  return {
    documents,
    indexedAt: new Date().toISOString(),
    ontologyVersion: '2026-08-v1'
  };
}

export function searchKnowledge(index, rawQuery, { limit = 5 } = {}) {
  const query = normalizeText(rawQuery || '');
  if (query.length < 2 || !index || !Array.isArray(index.documents)) {
    return emptyResult(query);
  }

  const detectedLabels = detectLabels(query);
  const terms = expandQueryTerms(query, detectedLabels);
  const scored = index.documents
    .map((document) => scoreDocument(document, query, terms, detectedLabels))
    .filter((item) => item.score >= 14)
    .sort((a, b) => b.score - a.score || compareDates(b.updatedAt, a.updatedAt))
    .slice(0, limit);

  const matches = scored.map((item) => ({
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    contentType: item.contentType,
    updatedAt: item.updatedAt,
    labels: item.labels.slice(0, 6),
    score: item.score,
    passages: selectPassages(item, terms, detectedLabels)
  }));

  const matchedSlugs = new Set(matches.slice(0, 3).map((item) => item.slug));
  const sources = dedupeSources(scored
    .filter((item) => matchedSlugs.has(item.slug))
    .flatMap((item) => item.evidence_json.map((source) => ({ ...source, reportSlug: item.slug }))));

  return {
    query,
    detectedLabels,
    matches,
    sources: sources.slice(0, 8),
    indexedDocumentCount: index.documents.length
  };
}

export function getOntologySuggestions() {
  return [...SUGGESTIONS];
}

export function splitMarkdownIntoPassages(markdown = '', fallback = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const passages = [];
  let heading = '핵심 내용';
  let buffer = [];

  const flush = () => {
    const text = buffer.join(' ').replace(/^[-*>\d.\s]+/, '').replace(/\s+/g, ' ').trim();
    if (text.length >= 12) passages.push({ heading, text: text.slice(0, 560) });
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].replace(/[*_`]/g, '').trim();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, ''));
  }
  flush();

  if (!passages.length && fallback) {
    passages.push({ heading: '요약', text: String(fallback).slice(0, 560) });
  }
  return passages;
}

function scoreDocument(document, query, terms, detectedLabels) {
  let score = 0;
  if (document.normalizedTitle.includes(query)) score += 28;
  if (document.normalizedSummary.includes(query)) score += 16;

  for (const term of terms) {
    if (term.length < 2) continue;
    if (document.normalizedTitle.includes(term)) score += 11;
    if (document.normalizedTopics.includes(term)) score += 9;
    if (document.normalizedSummary.includes(term)) score += 6;
    if (document.normalizedBody.includes(term)) score += 2;
  }

  const documentLabelIds = new Set(document.labels.map((item) => item.id));
  for (const label of detectedLabels) {
    if (documentLabelIds.has(label.id)) score += 18;
  }

  return { ...document, score };
}

function selectPassages(document, terms, detectedLabels) {
  const labelTerms = detectedLabels.flatMap((label) => label.aliases);
  const passageTerms = [...new Set([...terms, ...labelTerms].filter((term) => term.length >= 2))];
  const preferredHeadings = ['먼저 볼 내용', '확인된 흐름', '법에서 확인할 부분', '대응 순서', '상담 전에 확인할 점'];

  const scored = document.passages.map((passage, order) => {
    const normalized = normalizeText(`${passage.heading} ${passage.text}`);
    let score = 0;
    for (const term of passageTerms) {
      if (normalized.includes(term)) score += term.length >= 4 ? 4 : 2;
    }
    const preferredIndex = preferredHeadings.findIndex((heading) => passage.heading.includes(heading));
    if (preferredIndex >= 0) score += Math.max(1, 5 - preferredIndex);
    return { ...passage, score, order };
  });

  const selected = scored
    .filter((passage) => passage.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 3)
    .map(({ heading, text }) => ({ heading, text }));

  if (selected.length) return selected;
  return document.passages.slice(0, 2).map(({ heading, text }) => ({ heading, text }));
}

function detectLabels(value) {
  const normalized = normalizeText(value);
  return ONTOLOGY
    .filter((entry) => entry.aliases.some((alias) => normalized.includes(normalizeText(alias))))
    .map((entry) => ({ ...entry, aliases: [...entry.aliases] }));
}

function expandQueryTerms(query, labels) {
  const tokens = query
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  const aliases = labels.flatMap((label) => label.aliases.map(normalizeText));
  return [...new Set([...tokens, ...aliases])];
}

function normalizeSources(value) {
  const sources = Array.isArray(value) ? value : [];
  return sources
    .filter((source) => source && source.name && source.url)
    .map((source) => ({
      name: String(source.name),
      url: String(source.url),
      coverage: String(source.coverage || ''),
      checkedAt: String(source.checkedAt || source.fetchedAt || ''),
      caseNo: String(source.caseNo || '')
    }));
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = source.url || `${source.name}:${source.caseNo}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^0-9a-z가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emptyResult(query) {
  return {
    query,
    detectedLabels: [],
    matches: [],
    sources: [],
    indexedDocumentCount: 0
  };
}

function compareDates(left, right) {
  return new Date(left || 0).getTime() - new Date(right || 0).getTime();
}
