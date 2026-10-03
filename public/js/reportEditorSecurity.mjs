export function mergeReportMetadata(existingMetadata, evidenceCount, lastEditedAt, status) {
  const base = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
    ? { ...existingMetadata }
    : {};
  if (base.intake_source === 'admin-chat' && status !== 'draft') {
    throw new Error('ADMIN 접수 초안은 이 화면에서 공개할 수 없습니다. 검토 후 별도의 공개 글로 작성하세요.');
  }
  if (base.intake_source === 'admin-chat') {
    base.publish_approved = false;
  }
  return {
    ...base,
    evidenceCount: Number(evidenceCount || 0),
    lastEditedAt
  };
}

export function buildSanitizedPreview({ title, markdown, marked, purifier }) {
  if (typeof marked?.parse !== 'function' || typeof purifier?.sanitize !== 'function') {
    throw new Error('미리보기 안전 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  }
  const rawHtml = marked.parse(String(markdown || ''));
  return {
    title: String(title || '무제 리포트'),
    bodyHtml: purifier.sanitize(String(rawHtml || ''))
  };
}
