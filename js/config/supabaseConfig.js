import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { APP_CONFIG } from './appConfig.js';

let supabaseClient = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const url = APP_CONFIG.SUPABASE_URL;
  const key = APP_CONFIG.SUPABASE_KEY;
  if (!url || !key) {
    console.warn('Supabase URL/KEY are not configured. Set env vars VITE_SUPABASE_URL/VITE_SUPABASE_KEY.');
    return null;
  }
  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  return supabaseClient;
}

export function resetSupabaseClient() {
  supabaseClient = null;
}
