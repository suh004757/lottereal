const SAFE_REPORT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function reportStaticHref(slug) {
  const value = String(slug || '');
  return SAFE_REPORT_SLUG.test(value) ? `/reports/${value}.html` : '/report.html';
}

export function reportStaticUrl(slug, base = globalThis.location?.href || 'https://lottes.co.kr/') {
  return new URL(reportStaticHref(slug), base).toString();
}
