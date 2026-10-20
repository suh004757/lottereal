import { EXPORTED_REPORT_SLUGS } from '../generated/reportSlugs.mjs';

const SAFE_REPORT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function reportStaticHref(slug) {
  const value = String(slug || '');
  return SAFE_REPORT_SLUG.test(value) ? `/reports/${value}.html` : '/report.html';
}

export function reportStaticUrl(slug, base = globalThis.location?.href || 'https://lottes.co.kr/') {
  return new URL(reportStaticHref(slug), base).toString();
}

// Resolve old search-result links synchronously from exporter-owned local data.
export function legacyReportRedirectHref(search, exportedSlugs = EXPORTED_REPORT_SLUGS) {
  const slug = new URLSearchParams(search || '').get('slug') || '';
  if (!SAFE_REPORT_SLUG.test(slug) || !exportedSlugs?.has?.(slug)) return null;
  return reportStaticHref(slug);
}
