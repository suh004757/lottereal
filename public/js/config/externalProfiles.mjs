/**
 * The office's public agent pages on 직방 / 다방. Most listings are posted there first.
 * Paste the link copied from the app's 중개사무소 page → 공유 → 링크 복사; while a value is
 * empty (or not a public page) the button shows as "준비 중".
 */
export const EXTERNAL_PROFILE_URLS = Object.freeze({
  zigbang: '',
  dabang: ''
});

const PROFILES = Object.freeze([
  { key: 'zigbang', label: '직방', hosts: ['www.zigbang.com', 'zigbang.com', 'm.zigbang.com'] },
  { key: 'dabang', label: '다방', hosts: ['www.dabangapp.com', 'dabangapp.com', 'm.dabangapp.com'] }
]);

// Only public profile pages qualify: https, a known public host, and no query string,
// so a private back-office link (e.g. sp.zigbang.com/...?token=) can never go live.
function publicProfileUrl(value, hosts) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.search || url.username || url.password) return '';
  return url.href;
}

export function getExternalProfileLinks(urls = EXTERNAL_PROFILE_URLS) {
  return PROFILES.map(({ key, label, hosts }) => ({
    key,
    label,
    href: publicProfileUrl(urls[key], hosts)
  }));
}
