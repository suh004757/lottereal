/**
 * useAuth Hook - 인증 상태 관리
 * Supabase를 사용하여 사용자 인증을 처리하는 React 스타일 훅
 */

import { getSupabaseClient } from '../config/supabaseConfig.js';

/**
 * 인증 상태를 관리하는 커스텀 훅
 * @returns {Object} 인증 관련 메서드와 상태
 */
export function useAuth() {
  // Supabase 클라이언트 가져오기
  const supabase = getSupabaseClient();

  // 모의 사용자 객체 (Supabase가 없을 때 사용)
  const mockUser = { id: 'mock-user', email: null };

  /**
   * 현재 사용자 정보를 가져옵니다.
   * @returns {Promise<Object>} 사용자 객체
   */
  const getUser = async () => {
    if (!supabase) return mockUser;
    const { data: { user } } = await supabase.auth.getUser();
    return user || mockUser;
  };

  /**
   * 이메일과 비밀번호로 로그인합니다.
   * @param {string} email - 사용자 이메일
   * @param {string} password - 사용자 비밀번호
   * @returns {Promise<Object>} 로그인 결과 (사용자 및 세션 정보)
   * @throws {Error} 로그인 실패 시 에러
   */
  const signIn = async (email, password) => {
    if (!supabase) return mockUser;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data || { user: mockUser, session: null };
  };

  /**
   * 로그아웃합니다.
   * @returns {Promise<void>}
   * @throws {Error} 로그아웃 실패 시 에러
   */
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // 반환 객체: 현재 사용자, 메서드들, 인증 상태
  return {
    user: supabase && supabase.auth.user ? supabase.auth.user() : mockUser,
    getUser,
    signIn,
    signOut,
    isAuthenticated: Boolean(supabase && supabase.auth.user ? supabase.auth.user() : false)
  };
}
