const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function buildZigbangInquiryTarget(hash) {
  const match = /^#token=([^&]+)$/.exec(String(hash || ''));
  if (!match || !TOKEN_PATTERN.test(match[1])) return null;
  return `https://sp.zigbang.com/inquiry/list?token=${match[1]}`;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const target = buildZigbangInquiryTarget(window.location.hash);
  window.history.replaceState(null, '', window.location.pathname);
  if (target) {
    window.location.replace(target);
  } else {
    const status = document.querySelector('[data-redirect-status]');
    if (status) status.textContent = '문의 링크를 확인할 수 없습니다. Gmail에서 직방 문의 메일을 열어주세요.';
  }
}
