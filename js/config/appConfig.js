/**
 * App Config - 애플리케이션 설정
 * 환경 변수와 기본값을 사용하여 중앙 집중식 설정을 제공합니다.
 */

// 환경 변수 가져오기 (브라우저 또는 Node.js 환경 지원)
const env = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {});

// 애플리케이션 설정 객체
export const APP_CONFIG = {
  // 백엔드 프로바이더 ('supabase', 'api', 'mock')
  BACKEND_PROVIDER: (env?.VITE_BACKEND_PROVIDER || env?.BACKEND_PROVIDER || 'supabase').toLowerCase(),
  // API 기본 URL
  API_BASE_URL: env?.VITE_API_URL || env?.API_BASE_URL || '',
  // Supabase URL
  SUPABASE_URL: env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://itcztvceelfvppjwhmvl.supabase.co',
  // Supabase 공개 키
  SUPABASE_KEY: env?.VITE_SUPABASE_KEY || env?.SUPABASE_KEY || 'sb_publishable_N7z_92ke5pevs3U2TdhJLg_u1GtY7Ek',
  // 관리자 세션 타임아웃 (분)
  ADMIN_SESSION_TIMEOUT_MINUTES: Number(env?.VITE_ADMIN_SESSION_TIMEOUT || env?.ADMIN_SESSION_TIMEOUT || 30),
  // 관리자 IP 화이트리스트
  ADMIN_IP_WHITELIST: parseList(env?.VITE_ADMIN_IP_WHITELIST || env?.ADMIN_IP_WHITELIST || '')
};

/**
 * 콤마로 구분된 문자열을 배열로 파싱합니다.
 * @param {string} value - 파싱할 문자열
 * @returns {Array<string>} 파싱된 배열
 */
function parseList(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
