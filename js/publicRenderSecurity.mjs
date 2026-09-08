const UNSAFE_URL_CHARACTERS = /[\u0000-\u0020"'`<>\\]/;
const ABSOLUTE_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/;

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeAbsoluteHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || UNSAFE_URL_CHARACTERS.test(raw) || raw.startsWith('//')) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

export function safeExternalHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!ABSOLUTE_SCHEME.test(raw)) return '';
  return normalizeAbsoluteHttpUrl(raw);
}

export function safeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || UNSAFE_URL_CHARACTERS.test(raw) || raw.startsWith('//')) return '';
  if (ABSOLUTE_SCHEME.test(raw)) return normalizeAbsoluteHttpUrl(raw);
  if (raw.includes(':')) return '';
  return raw;
}
