/**
 * Auth Service - 관리자 인증 서비스
 * Supabase를 사용하여 관리자 로그인, 세션 관리, 로그 기록을 처리합니다.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { APP_CONFIG } from '../config/appConfig.js';

// 세션 타임아웃 설정 (분 단위)
const SESSION_TIMEOUT_MS = Math.max(1, Number(APP_CONFIG.ADMIN_SESSION_TIMEOUT_MINUTES || 30)) * 60 * 1000;
// 세션 시작 시간 저장 키
const SESSION_START_KEY = 'admin_session_started_at';

// Supabase 클라이언트 및 세션 관련 변수
let supabaseClient = null;
let sessionTimer = null;
let sessionStartedAt = null;

/**
 * Supabase 클라이언트를 초기화하고 반환합니다.
 * @returns {Object} Supabase 클라이언트 인스턴스
 * @throws {Error} 설정이 누락된 경우
 */
function ensureClient() {
  if (supabaseClient) return supabaseClient;
  if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_KEY) {
    throw new Error('Supabase URL/KEY are not configured');
  }
  supabaseClient = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  // 인증 상태 변경 이벤트 리스너
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const started = loadSessionStart() || Date.now();
      armSessionTimer(started);
    }
    if (event === 'SIGNED_OUT') {
      clearSessionTimer();
      clearSessionStart();
    }
  });

  hydrateFromPersistedSession();
  return supabaseClient;
}

/**
 * 지속된 세션에서 타이머를 복원합니다.
 */
async function hydrateFromPersistedSession() {
  try {
    const client = ensureClient();
    const { data } = await client.auth.getSession();
    if (data?.session) {
      const startMs = loadSessionStart() || Date.now();
      armSessionTimer(startMs);
    }
  } catch (err) {
    console.warn('[Auth] Failed to hydrate session timer:', err);
  }
}

/**
 * 세션 타이머를 설정합니다.
 * @param {number} startMs - 세션 시작 시간 (밀리초)
 */
function armSessionTimer(startMs = Date.now()) {
  clearSessionTimer();
  sessionStartedAt = startMs;
  persistSessionStart(startMs);
  const remaining = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - startMs));
  if (remaining <= 0) {
    signOutAdmin({ reason: 'timeout' });
    return;
  }
  sessionTimer = setTimeout(() => signOutAdmin({ reason: 'timeout' }), remaining);
}

/**
 * 세션 타이머를 정리합니다.
 */
function clearSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
  sessionStartedAt = null;
}

/**
 * 세션 시작 시간을 로컬 스토리지에 저장합니다.
 * @param {number} value - 시작 시간
 */
function persistSessionStart(value) {
  try {
    localStorage.setItem(SESSION_START_KEY, String(value));
  } catch (_e) {}
}

/**
 * 로컬 스토리지에서 세션 시작 시간을 로드합니다.
 * @returns {number|null} 시작 시간 또는 null
 */
function loadSessionStart() {
  try {
    const raw = localStorage.getItem(SESSION_START_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (_e) {
    return null;
  }
}

/**
 * 세션 시작 시간을 로컬 스토리지에서 제거합니다.
 */
function clearSessionStart() {
  try {
    localStorage.removeItem(SESSION_START_KEY);
  } catch (_e) {}
}

/**
 * 세션 만료 시간을 반환합니다.
 * @returns {Date|null} 만료 날짜 또는 null
 */
export function getSessionExpiry() {
  if (!sessionStartedAt) return null;
  return new Date(sessionStartedAt + SESSION_TIMEOUT_MS);
}

/**
 * 세션 남은 시간을 밀리초로 반환합니다.
 * @returns {number|null} 남은 시간 또는 null
 */
export function getSessionRemainingMs() {
  if (!sessionStartedAt) return null;
  return Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - sessionStartedAt));
}

/**
 * 관리자 로그인을 수행합니다.
 * @param {string} email - 이메일 주소
 * @param {string} password - 비밀번호
 * @param {Object} options - 추가 옵션 (userAgent, ipAddressHint, geolocation 등)
 * @returns {Promise<Object>} 로그인 결과
 */
export async function signInAdmin(email, password, options = {}) {
  const client = ensureClient();
  const userAgent = options.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const ipAddress = options.ipAddressHint || null; // Prefer server-side capture for real IP.
  const geolocation = options.geolocation || null;
  const whitelist = Array.isArray(APP_CONFIG.ADMIN_IP_WHITELIST) ? APP_CONFIG.ADMIN_IP_WHITELIST : [];

  if (!email || !password) {
    const error = 'Please enter both email and password.';
    await logAuthEvent('failure', { email, reason: error, userAgent, ipAddress, geolocation });
    return { success: false, error };
  }

  if (whitelist.length && ipAddress && !whitelist.includes(ipAddress)) {
    const error = 'IP not allowed. Please contact the administrator.';
    await logAuthEvent('failure', { email, reason: error, userAgent, ipAddress, geolocation });
    return { success: false, error };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    await logAuthEvent('failure', { email, reason: error.message, userAgent, ipAddress, geolocation });
    return { success: false, error: error.message };
  }

  if (data?.session) {
    armSessionTimer(Date.now());
  }

  await logAuthEvent('success', {
    email,
    userId: data?.user?.id || null,
    userAgent,
    ipAddress,
    geolocation
  });

  return { success: true, session: data.session, user: data.user };
}

/**
 * 관리자 로그아웃을 수행합니다.
 * @param {Object} options - 로그아웃 옵션 (onSignedOut 콜백 등)
 */
export async function signOutAdmin(options = {}) {
  try {
    const client = ensureClient();
    await client.auth.signOut();
  } catch (err) {
    console.warn('[Auth] Sign-out failed:', err);
  } finally {
    clearSessionTimer();
    clearSessionStart();
    if (options?.onSignedOut) options.onSignedOut();
  }
}

/**
 * 현재 세션의 사용자 정보를 가져옵니다.
 * @returns {Promise<Object|null>} 사용자 객체 또는 null
 */
export async function getCurrentSessionUser() {
  try {
    const client = ensureClient();
    const { data } = await client.auth.getUser();
    if (data?.user) {
      const startMs = loadSessionStart() || Date.now();
      armSessionTimer(startMs);
    }
    return data?.user || null;
  } catch (err) {
    console.warn('[Auth] Failed to fetch user:', err);
    return null;
  }
}

/**
 * 인증 상태 변경 콜백을 등록합니다.
 * @param {Function} callback - 콜백 함수
 * @returns {Object} 구독 객체
 */
export function onAuthStateChange(callback) {
  const client = ensureClient();
  return client.auth.onAuthStateChange(callback);
}

/**
 * 인증 이벤트를 데이터베이스에 기록합니다.
 * @param {string} status - 이벤트 상태 ('success' 또는 'failure')
 * @param {Object} details - 이벤트 세부 정보
 */
async function logAuthEvent(status, details = {}) {
  try {
    const client = ensureClient();
    const payload = {
      status,
      email: details.email || null,
      user_id: details.userId || null,
      user_agent: details.userAgent || null,
      ip_address: details.ipAddress || null,
      geo_lat: details.geolocation?.coords?.latitude ?? null,
      geo_lng: details.geolocation?.coords?.longitude ?? null,
      geo_accuracy: details.geolocation?.coords?.accuracy ?? null,
      reason: details.reason || null,
      logged_at: new Date().toISOString()
    };
    await client.from('admin_login_logs').insert(payload);
  } catch (err) {
    console.warn('[Auth] Failed to log auth event:', err);
  }
}
