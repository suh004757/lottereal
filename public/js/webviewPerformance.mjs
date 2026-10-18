const KAKAO_USER_AGENT = /KAKAOTALK/i;

export function isKakaoInAppBrowser(userAgent = '') {
  return KAKAO_USER_AGENT.test(String(userAgent));
}

export function applyWebviewPerformanceMode({
  userAgent = globalThis.navigator?.userAgent || '',
  root = globalThis.document?.documentElement
} = {}) {
  if (!root || !isKakaoInAppBrowser(userAgent)) return false;
  root.classList.add('lr-kakao-webview');
  root.dataset.inAppBrowser = 'kakao';
  globalThis.dispatchEvent?.(new CustomEvent('lottereal:webview-performance', {
    detail: { mode: 'kakao' }
  }));
  return true;
}

if (typeof document !== 'undefined') applyWebviewPerformanceMode();
