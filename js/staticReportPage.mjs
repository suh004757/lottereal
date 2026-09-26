const SAFE_REPORT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSafeReportSlug(slug) {
  return SAFE_REPORT_SLUG.test(String(slug || ''));
}

export async function trackStaticReportView(slug, increment) {
  if (!isSafeReportSlug(slug) || typeof increment !== 'function') return false;
  await increment(slug);
  return true;
}

async function initializeStaticReportView() {
  const slug = document.body?.dataset?.reportSlug || '';
  if (!isSafeReportSlug(slug)) return;
  try {
    const { incrementReportViews } = await import('./services/reportAdapter.js');
    await trackStaticReportView(slug, incrementReportViews);
  } catch (error) {
    console.warn('[Analytics] Failed to increment static report view count:', error);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStaticReportView, { once: true });
  } else {
    initializeStaticReportView();
  }
}
