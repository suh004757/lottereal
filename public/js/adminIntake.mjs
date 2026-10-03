const INTAKE_TYPES = new Set(['listing', 'report']);

function clean(value) {
  return String(value ?? '').trim();
}

function parseSourceUrls(value) {
  const urls = [];
  for (const item of clean(value).split(/[\n,\s]+/)) {
    if (!item) continue;
    try {
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const normalized = url.toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Invalid source text stays out of structured metadata.
    }
  }
  return urls.slice(0, 10);
}

export function detectSensitiveDetails(value) {
  const text = clean(value);
  const flags = [];
  if (/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/.test(text)) flags.push('phone');
  if (/\d{1,4}\s*동\s*\d{1,4}\s*호/.test(text)) flags.push('unit_number');
  if (/(공동현관|출입\s*(?:번호|코드)|도어락|비밀\s*번호|비번)/.test(text)) flags.push('access_code');
  return flags;
}

export function buildAdminIntakePayload(values = {}, options = {}) {
  const type = clean(values.type);
  const text = clean(values.text);
  if (!INTAKE_TYPES.has(type)) {
    throw new Error('글 작성인지 매물 등록인지 선택해 주세요.');
  }
  if (text.length < 10) {
    throw new Error('내용을 10자 이상 입력해 주세요.');
  }
  if (text.length > 12000) {
    throw new Error('내용은 12,000자 이하로 입력해 주세요.');
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const nonce = clean(options.nonce) || globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const region = clean(values.region).slice(0, 80);
  const transactionType = clean(values.transactionType).slice(0, 30);
  const sourceUrls = parseSourceUrls(values.sources);
  const kindLabel = type === 'listing' ? '매물' : '글';
  const sensitivityFlags = detectSensitiveDetails(text);

  return {
    slug: `admin-intake-${type}-${stamp}-${nonce}`,
    title: `[검토 대기] ${kindLabel} 초안${region ? ` · ${region}` : ''}`,
    summary: `${kindLabel} 작성을 위한 관리자 원문이 비공개로 접수되었습니다.`,
    report_md: text,
    evidence_json: sourceUrls.map((url) => ({ name: '관리자 제공 참고자료', url })),
    status: 'draft',
    metadata: {
      intake_source: 'admin-chat',
      intake_type: type,
      review_state: 'awaiting_discussion',
      publish_approved: false,
      region: region || null,
      transaction_type: type === 'listing' ? (transactionType || null) : null,
      source_urls: type === 'report' ? sourceUrls : [],
      sensitive_flags: sensitivityFlags,
      ai_processing: 'pending',
      original_visibility: 'admin_only'
    },
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}
