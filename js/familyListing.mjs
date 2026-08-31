function cleanToken(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z가-힣_-]/g, '');
}

export function shouldQueueFamilySourceDraft(sourceText, existingSourceText = '') {
  const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const next = normalize(sourceText);
  return Boolean(next) && next !== normalize(existingSourceText);
}

export function describeIntakeYearMonth(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value ?? '').trim());
  if (!match) throw new Error('접수연월은 YYYY-MM 형식으로 입력해 주세요.');
  const [, year, month] = match;
  return {
    code: `${year.slice(2)}${month}`,
    label: `${Number(year)}년 ${Number(month)}월 접수`
  };
}

export function buildFamilyListingAlias(values = {}) {
  const neighborhood = cleanToken(values.neighborhood).replace(/동$/, '') || '지역미정';
  const building = cleanToken(values.buildingKeyword) || '건물미정';
  const unit = cleanToken(values.unitLabel).replace(/호$/, '') || '호수미정';
  const transaction = cleanToken(values.transactionType) || '거래미정';
  const intake = describeIntakeYearMonth(values.intakeYearMonth);
  return [neighborhood, building, unit, transaction, intake.code].join('-');
}

export function ensureUniqueFamilyAlias(baseAlias, existingAliases = []) {
  const base = cleanToken(baseAlias);
  if (!base) throw new Error('관리호칭을 만들 수 없습니다.');
  const existing = new Set(existingAliases.map((value) => String(value ?? '').trim()));
  if (!existing.has(base)) return base;
  let sequence = 2;
  while (existing.has(`${base}-${sequence}`)) sequence += 1;
  return `${base}-${sequence}`;
}

function cleanLine(value, maxLength = 120) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

const FAMILY_TRANSACTION_TYPES = new Set(['매매', '전세', '월세', '임대', '기타']);

export function buildQuickFamilyListingInput(values = {}, options = {}) {
  const listingTitle = cleanLine(values.listingTitle, 100);
  const mode = values.mode === 'photo_task' ? 'photo_task' : 'post';
  const rawText = String(values.text ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (mode === 'photo_task' && rawText.length > 220) {
    throw new Error('촬영할 내용은 220자 이내로 적어 주세요.');
  }
  const text = cleanLine(rawText, mode === 'photo_task' ? 220 : 2000);
  if (!listingTitle) throw new Error('어느 매물인지 적어 주세요.');
  if (!text) throw new Error(mode === 'photo_task' ? '찍을 곳을 적어 주세요.' : '매물 내용을 적어 주세요.');

  const tokens = listingTitle.split(/\s+/).filter(Boolean);
  const transactionMatch = listingTitle.match(/매매|전세|월세|단기|임대/);
  const transactionToken = transactionMatch?.[0] || '';
  const transactionType = transactionToken === '단기' ? '임대' : (transactionToken || '기타');
  const unitMatch = [...listingTitle.matchAll(/(?:^|\s)(\d{1,4})(?:호)?(?=\s|$)/g)].at(-1);
  const unitToken = unitMatch?.[1] || '';
  const unitLabel = unitToken ? `${unitToken}호` : '호수확인';
  const neighborhood = tokens.length > 1 ? tokens[0].replace(/동$/, '') : '위치확인';
  const buildingTokens = tokens.filter((token, index) => (
    index !== 0
    && token !== transactionToken
    && !/^\d{1,4}호?$/.test(token)
  ));
  const buildingKeyword = cleanToken(buildingTokens.join(' '))
    || cleanToken(tokens[0])
    || '건물확인';
  const now = options.now instanceof Date ? options.now : new Date();
  const monthParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  const year = monthParts.find((part) => part.type === 'year')?.value;
  const month = monthParts.find((part) => part.type === 'month')?.value;
  const intakeYearMonth = `${year}-${month}`;
  const visitMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(values.visitDate || ''));
  const visitLabel = visitMatch ? `${Number(visitMatch[2])}월 ${Number(visitMatch[3])}일 · ` : '';

  return {
    neighborhood,
    buildingKeyword,
    unitLabel,
    transactionType,
    intakeYearMonth,
    status: mode === 'photo_task' ? 'needs_info' : 'new',
    sourceLabel: mode === 'photo_task' ? '현장 촬영 예정' : '빠른 등록',
    staffTask: mode === 'photo_task' ? `${visitLabel}${text}` : ''
  };
}

export function groupFamilyListingPhotos(batches = [], signedUrls = new Map()) {
  const urlFor = (path) => signedUrls instanceof Map ? signedUrls.get(path) : signedUrls?.[path];
  const groups = {};
  const orderedBatches = Array.from(batches || []).sort((left, right) => (
    String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
  ));
  orderedBatches.forEach((batch) => {
    const metadata = batch?.metadata || {};
    const listingId = cleanLine(metadata.family_listing_id, 80);
    const paths = Array.isArray(metadata.private_image_paths) ? metadata.private_image_paths : [];
    const originalPaths = Array.isArray(metadata.private_original_image_paths) ? metadata.private_original_image_paths : [];
    if (!listingId || metadata.photo_upload_state !== 'complete' || !paths.length) return;
    groups[listingId] ||= [];
    paths.forEach((path, index) => {
      if (typeof path !== 'string' || !path || /^https?:\/\//i.test(path)) return;
      const originalPath = typeof originalPaths[index] === 'string' && !/^https?:\/\//i.test(originalPaths[index])
        ? originalPaths[index]
        : '';
      groups[listingId].push({
        batchId: String(batch.id || ''),
        path,
        url: String(urlFor(path) || ''),
        originalPath,
        originalUrl: String(originalPath ? urlFor(originalPath) || '' : ''),
        createdAt: String(batch.created_at || ''),
        position: index + 1
      });
    });
  });
  return groups;
}

function redactStaffValue(value, maxLength = 120) {
  const redacted = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/https?:\/\/[^\s]+/gi, '[민감 링크 제외]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 제외]')
    .replace(/(집주인|임대인|임차인|세입자|고객|소유자)(?:\s*(?:이름|성명))?\s*[:=]?\s*[가-힣]{2,4}/g, '$1 [개인정보 제외]')
    .replace(/(?<!\d)(?:\+82[\s.-]?(?:\(0\)[\s.-]?)?1[016789]|\(?01[016789]\)?)[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g, '[연락처 제외]')
    .replace(/(?<!\d)(?:\+82[\s.-]?(?:\(0\)[\s.-]?)?(?:2|[3-6][1-5])|\(?0(?:2|[3-6][1-5])\)?)[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g, '[연락처 제외]')
    .replace(/(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/g, '[신분번호 제외]')
    .replace(/(공동\s*현관|현관|출입\s*(?:비밀\s*)?(?:번호|코드|암호)|출입|도어\s*[- ]?\s*락|도어락|세대\s*비밀\s*번호|비밀\s*번호|비번|access\s*(?:code|number|password)|door\s*[- ]?\s*(?:code|lock)|doorlock|password)(?:\s*(?:번호|암호|코드))?(?:은|는)?\s*(?:(?:종|열쇠|키|버튼|호출)\s*)?[:=]?\s*[#*]?(?:\d[\s#*\-]*){3,12}/gi, '$1 [제외]')
    .replace(/(계좌\s*(?:번호)?|입금|국민|신한|우리|하나|농협|기업|카카오뱅크|토스뱅크|account(?:\s*number)?|bank\s*account)(?:은행)?(?:은|는)?\s*[:=]?\s*[0-9][0-9\s-]{5,}[0-9]/gi, '$1 [제외]')
    .replace(/(?<!\d)\d(?:[\s-]?\d){8,15}(?!\d)/g, '[긴 숫자 제외]');
  return cleanLine(redacted, maxLength);
}

export function buildOriginalListingShareText(record = {}, sourceText = '') {
  const title = [record.neighborhood, record.building_keyword, record.unit_label]
    .map((value) => redactStaffValue(value, 80))
    .filter(Boolean)
    .join(' ');
  const source = redactStaffValue(sourceText, 2000);
  return [`[${title || '매물'}]`, source || buildStaffShareText(record)].join('\n');
}

export const FAMILY_LISTING_STATUSES = Object.freeze({
  new: '신규',
  needs_info: '사진·정보 필요',
  ready: '광고 준비',
  advertising: '광고 중',
  inquiry: '문의 있음',
  visit: '방문 예정',
  contract: '계약 진행',
  completed: '계약 완료',
  hold: '보류',
  closed: '종료'
});

export function statusLabel(status) {
  return FAMILY_LISTING_STATUSES[String(status ?? '').trim()] || '상태 미정';
}

function readValue(values, camelKey, snakeKey = camelKey) {
  return values?.[camelKey] ?? values?.[snakeKey] ?? '';
}

export function normalizeFamilyListingInput(values = {}, options = {}) {
  const status = cleanLine(readValue(values, 'status'), 30) || 'new';
  if (!Object.hasOwn(FAMILY_LISTING_STATUSES, status)) {
    throw new Error('허용되지 않은 매물 상태입니다.');
  }
  const intakeYearMonth = cleanLine(readValue(values, 'intakeYearMonth', 'intake_year_month'), 7);
  describeIntakeYearMonth(intakeYearMonth);
  const aliasCode = cleanLine(options.aliasCode || readValue(values, 'aliasCode', 'alias_code'), 100);
  if (!aliasCode) throw new Error('매물 이름을 확인해 주세요.');
  const neighborhood = cleanLine(readValue(values, 'neighborhood'), 40);
  const buildingKeyword = cleanLine(readValue(values, 'buildingKeyword', 'building_keyword'), 80);
  const unitLabel = cleanLine(readValue(values, 'unitLabel', 'unit_label'), 40);
  const transactionType = cleanLine(readValue(values, 'transactionType', 'transaction_type'), 20);
  if (!neighborhood || !buildingKeyword || !unitLabel || !transactionType) {
    throw new Error('동네, 건물 키워드, 호수/층, 거래유형을 입력해 주세요.');
  }
  if (!FAMILY_TRANSACTION_TYPES.has(transactionType)) {
    throw new Error('거래유형을 확인해 주세요.');
  }
  return {
    alias_code: aliasCode,
    neighborhood,
    building_keyword: buildingKeyword,
    unit_label: unitLabel,
    transaction_type: transactionType,
    intake_year_month: intakeYearMonth,
    status,
    price_summary: cleanLine(readValue(values, 'priceSummary', 'price_summary'), 120),
    floor_summary: cleanLine(readValue(values, 'floorSummary', 'floor_summary'), 60),
    layout_summary: cleanLine(readValue(values, 'layoutSummary', 'layout_summary'), 80),
    move_in_summary: cleanLine(readValue(values, 'moveInSummary', 'move_in_summary'), 80),
    assigned_to: cleanLine(readValue(values, 'assignedTo', 'assigned_to'), 60),
    source_label: cleanLine(readValue(values, 'sourceLabel', 'source_label'), 60),
    staff_task: cleanLine(readValue(values, 'staffTask', 'staff_task'), 240),
    internal_notes: cleanLine(readValue(values, 'internalNotes', 'internal_notes'), 1000)
  };
}

const PARSE_REVIEW_FIELD_LIMITS = Object.freeze({
  neighborhood: 40,
  building_keyword: 80,
  unit_label: 40,
  transaction_type: 20,
  intake_year_month: 7,
  status: 30,
  price_summary: 120,
  floor_summary: 60,
  layout_summary: 80,
  move_in_summary: 80,
  assigned_to: 60,
  source_label: 60,
  staff_task: 240,
  internal_notes: 1000
});

export function buildFamilyParseReview({ sourceText = '', existingRecord = {}, suggestions = {} } = {}) {
  const fields = {};
  for (const [field, maxLength] of Object.entries(PARSE_REVIEW_FIELD_LIMITS)) {
    const existingValue = cleanLine(existingRecord?.[field], maxLength);
    const suggestion = suggestions?.[field];
    const suggestedValue = suggestion && typeof suggestion === 'object'
      ? cleanLine(suggestion.value, maxLength)
      : '';
    const rawConfidence = Number(suggestion?.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0;
    const conflicts = Boolean(existingValue && suggestedValue && existingValue !== suggestedValue);
    let status = 'empty';
    if (!suggestedValue && existingValue) status = 'kept_existing';
    else if (suggestedValue && (conflicts || confidence < 0.8)) status = 'needs_review';
    else if (suggestedValue) status = 'suggested';
    fields[field] = {
      existing_value: existingValue,
      suggested_value: suggestedValue,
      value: conflicts || !suggestedValue ? existingValue : suggestedValue,
      status,
      confidence
    };
  }
  return {
    source_text: String(sourceText ?? ''),
    parse_status: 'draft',
    fields
  };
}

export function finalizeFamilyParseReview(draft = {}, decisions = {}) {
  if (!draft?.fields || typeof draft.fields !== 'object') {
    throw new Error('확인할 정리 결과가 없습니다.');
  }
  const reviewedValues = {};
  const unresolved = [];
  for (const [field, maxLength] of Object.entries(PARSE_REVIEW_FIELD_LIMITS)) {
    const candidate = draft.fields[field] || {};
    const decision = decisions?.[field];
    if (candidate.status === 'needs_review' && !decision) {
      unresolved.push(field);
      continue;
    }
    let value = candidate.value ?? '';
    if (decision) {
      if (decision.choice === 'existing') value = candidate.existing_value ?? '';
      else if (decision.choice === 'suggested') value = candidate.suggested_value ?? '';
      else if (decision.choice === 'custom') value = decision.value ?? '';
      else throw new Error('허용되지 않은 확인 선택입니다.');
    }
    reviewedValues[field] = cleanLine(value, maxLength);
  }
  if (unresolved.length) {
    throw new Error(`확인이 필요한 항목이 남아 있습니다: ${unresolved.join(', ')}`);
  }
  return {
    source_text: String(draft.source_text ?? ''),
    parse_status: 'reviewed',
    reviewed_values: reviewedValues
  };
}

export function filterFamilyListings(items = [], filters = {}) {
  const status = cleanLine(filters.status, 30);
  const tokens = cleanLine(filters.query, 200).toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (!tokens.length) return true;
    const haystack = [
      item.alias_code,
      item.neighborhood,
      item.building_keyword,
      item.unit_label,
      item.transaction_type,
      item.price_summary,
      item.assigned_to,
      statusLabel(item.status)
    ].map((value) => cleanLine(value, 200).toLocaleLowerCase('ko-KR')).join(' ');
    return tokens.every((token) => haystack.includes(token));
  });
}

export function buildStaffShareText(item = {}) {
  const alias = redactStaffValue(item.alias_code, 100) || '관리호칭 미정';
  const location = [
    redactStaffValue(item.neighborhood, 40),
    redactStaffValue(item.building_keyword, 60),
    redactStaffValue(item.unit_label, 30)
  ].filter(Boolean).join(' ');
  const rows = [
    `[${alias}]`,
    '',
    `위치: ${location || '확인 필요'}`,
    `거래: ${redactStaffValue(item.transaction_type, 20) || '확인 필요'}`,
    `가격: ${redactStaffValue(item.price_summary) || '확인 필요'}`,
    `현재 상태: ${statusLabel(item.status)}`,
    `담당: ${redactStaffValue(item.assigned_to, 60) || '미정'}`,
    `층수: ${redactStaffValue(item.floor_summary, 40) || '확인 필요'}`,
    `구조: ${redactStaffValue(item.layout_summary, 60) || '확인 필요'}`,
    `입주: ${redactStaffValue(item.move_in_summary, 60) || '확인 필요'}`
  ];
  const task = redactStaffValue(item.staff_task, 180);
  if (task) rows.push('', `확인할 내용: ${task}`);
  return rows.join('\n');
}

export function buildAdvertisingDraftText(item = {}) {
  const safe = (value, maxLength = 180) => redactStaffValue(value, maxLength);
  return [
    '[광고 준비용 매물]',
    `매물 이름: ${safe(item.alias_code, 100) || '미정'}`,
    `동네: ${safe(item.neighborhood, 40) || '확인 필요'}`,
    `건물: ${safe(item.building_keyword, 80) || '확인 필요'}`,
    `호수·층: ${safe(item.unit_label, 40) || '확인 필요'}`,
    `거래 유형: ${safe(item.transaction_type, 20) || '확인 필요'}`,
    `가격: ${safe(item.price_summary, 120) || '확인 필요'}`,
    `층수: ${safe(item.floor_summary, 60) || '확인 필요'}`,
    `구조: ${safe(item.layout_summary, 80) || '확인 필요'}`,
    `입주: ${safe(item.move_in_summary, 80) || '확인 필요'}`
  ].join('\n');
}
