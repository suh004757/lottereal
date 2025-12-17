import { supabase } from '../config/supabaseConfig.js';

/**
 * Hook to manage authentication state
 */
export function useAuth() {
  // Current User
  const user = supabase ? supabase.auth.user() : null; // v1 syntax, checking for v2 below

  // For Supabase v2, getting user is async or requires session check
  // This is a simplified synchronous hook wrapper. 
  // In a real React app this would be a real hook. 
  // For Vanilla JS, we expose methods.

  const getUser = async () => {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  };

  const signIn = async (email, password) => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return {
    user: user, // Note: this might be null initially
    getUser,
    signIn,
    signOut
  };
}
