function declaredLanguage(item) {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  return String(
    item?.language ||
    item?.locale ||
    item?.lang ||
    metadata.language ||
    metadata.locale ||
    metadata.lang ||
    ''
  ).trim().toLowerCase();
}

export function filterContentForLanguage(items, language) {
  const rows = Array.isArray(items) ? items : [];
  if (String(language || '').toLowerCase() !== 'en') return rows;
  return rows.filter((item) => /^en(?:[-_]|$)/.test(declaredLanguage(item)));
}
