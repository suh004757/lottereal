/**
 * Supabase Config - Supabase 클라이언트 설정
 * Supabase 클라이언트를 생성하고 관리합니다.
 */

import '../vendor/supabase-2.45.4.min.js';
import { APP_CONFIG } from './appConfig.js';

const createClient = globalThis.supabase?.createClient;

// Supabase 클라이언트 인스턴스 (싱글톤)
let supabaseClient = null;

/**
 * Supabase 클라이언트를 가져옵니다. (싱글톤 패턴)
 * @returns {Object|null} Supabase 클라이언트 또는 null (설정 누락 시)
 */
export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = APP_CONFIG.SUPABASE_URL;
  const key = APP_CONFIG.SUPABASE_KEY;
  if (typeof createClient !== 'function') {
    console.warn('The self-hosted Supabase runtime is unavailable.');
    return null;
  }
  if (!url || !key) {
    console.warn('Supabase URL/KEY are not configured. Set env vars VITE_SUPABASE_URL/VITE_SUPABASE_KEY.');
    return null;
  }
  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  return supabaseClient;
}

/**
 * Supabase 클라이언트를 리셋합니다. (테스트용)
 */
export function resetSupabaseClient() {
  supabaseClient = null;
}
