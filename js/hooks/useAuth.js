import { getSupabaseClient } from '../config/supabaseConfig.js';

/**
 * Hook to manage authentication state
 */
export function useAuth() {
  const supabase = getSupabaseClient();
  const mockUser = { id: 'mock-user', email: null };

  const getUser = async () => {
    if (!supabase) return mockUser;
    const { data: { user } } = await supabase.auth.getUser();
    return user || mockUser;
  };

  const signIn = async (email, password) => {
    if (!supabase) return mockUser;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data || { user: mockUser, session: null };
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return {
    user: supabase && supabase.auth.user ? supabase.auth.user() : mockUser,
    getUser,
    signIn,
    signOut,
    isAuthenticated: Boolean(supabase && supabase.auth.user ? supabase.auth.user() : false)
  };
}
