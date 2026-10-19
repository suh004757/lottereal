const SAFE_REPORT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function reportStaticHref(slug) {
  const value = String(slug || '');
  return SAFE_REPORT_SLUG.test(value) ? `/reports/${value}.html` : '/report.html';
}

export function reportStaticUrl(slug, base = globalThis.location?.href || 'https://lottes.co.kr/') {
  return new URL(reportStaticHref(slug), base).toString();
}

// Legacy report.html?slug=... links (still indexed by Naver) move to the
// static page, but only when that page exists, so an unexported slug keeps
// rendering through report.html instead of landing on the 404 page.
export async function legacyReportRedirectHref(search, fetchImpl = globalThis.fetch) {
  const slug = new URLSearchParams(search || '').get('slug') || '';
  if (!SAFE_REPORT_SLUG.test(slug) || typeof fetchImpl !== 'function') return null;
  const href = reportStaticHref(slug);
  try {
    const response = await fetchImpl(href, { method: 'HEAD', cache: 'no-store' });
    return response?.ok ? href : null;
  } catch {
    return null;
  }
}
