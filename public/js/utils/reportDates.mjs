const DEFAULT_REVISION_TOLERANCE_MS = 5 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getPublicationDate(report = {}) {
  return parseDate(report.created_at) || parseDate(report.updated_at);
}

export function getRevisionDate(report = {}, { toleranceMs = DEFAULT_REVISION_TOLERANCE_MS } = {}) {
  const published = getPublicationDate(report);
  const updated = parseDate(report.updated_at);
  if (!published || !updated) return null;
  return updated.getTime() - published.getTime() > toleranceMs ? updated : null;
}

export function compareReportsByPublication(a = {}, b = {}) {
  const aTime = getPublicationDate(a)?.getTime() ?? 0;
  const bTime = getPublicationDate(b)?.getTime() ?? 0;
  if (bTime !== aTime) return bTime - aTime;
  return String(b.id ?? '').localeCompare(String(a.id ?? ''), 'en');
}

export function formatReportDateMeta(report = {}, { locale = 'ko-KR', timeZone = 'Asia/Seoul' } = {}) {
  const published = getPublicationDate(report);
  if (!published) return '';
  const revised = getRevisionDate(report);
  const isEnglish = String(locale).toLowerCase().startsWith('en');
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: isEnglish ? 'short' : 'numeric',
    day: 'numeric',
    timeZone
  });
  const publishedLabel = isEnglish ? 'Published' : '발행';
  const revisedLabel = isEnglish ? 'Updated' : '수정됨';
  const parts = [`${publishedLabel} ${formatter.format(published)}`];
  if (revised) parts.push(`${revisedLabel} ${formatter.format(revised)}`);
  return parts.join(' · ');
}
