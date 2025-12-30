/**
 * useAuth Hook - 인증 상태 관리
 * Supabase를 사용하여 사용자 인증을 처리하는 React 스타일 훅
 */

import { getSupabaseClient } from '../config/supabaseConfig.js';

const DEFAULT_AUTH = {
  client: null,
  async getUser() {
    return null;
  },
  async getSession() {
    return null;
  },
  async signIn() {
    throw new Error('Authentication is not available.');
  },
  async signOut() {},
  async isAuthenticated() {
    return false;
  },
  user: null
};

const AUTH_ERROR = new Error('Supabase authentication is not configured. Please set SUPABASE_URL and SUPABASE_KEY.');

/**
 * Lightweight auth helper used across the app.
 * @param {Object} options
 * @param {boolean} [options.requireAuth=false] - Throw if Supabase is unavailable
 */
export function useAuth(options = {}) {
  const { requireAuth = false } = options;
  const supabase = getSupabaseClient();

  if (!supabase) {
    if (requireAuth) throw AUTH_ERROR;
    return DEFAULT_AUTH;
  }

  const getUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
  };

  const getSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isAuthenticated = async () => {
    const session = await getSession();
    return Boolean(session);
  };

  return {
    client: supabase,
    getUser,
    getSession,
    signIn,
    signOut,
    isAuthenticated,
    user: null
  };
}
