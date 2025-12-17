// Centralized application configuration (no window access)
const env = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {});

export const APP_CONFIG = {
  BACKEND_PROVIDER: (env?.VITE_BACKEND_PROVIDER || env?.BACKEND_PROVIDER || 'supabase').toLowerCase(),
  API_BASE_URL: env?.VITE_API_URL || env?.API_BASE_URL || '',
  SUPABASE_URL: env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://itcztvceelfvppjwhmvl.supabase.co',
  SUPABASE_KEY: env?.VITE_SUPABASE_KEY || env?.SUPABASE_KEY || 'sb_publishable_N7z_92ke5pevs3U2TdhJLg_u1GtY7Ek',
  ADMIN_SESSION_TIMEOUT_MINUTES: Number(env?.VITE_ADMIN_SESSION_TIMEOUT || env?.ADMIN_SESSION_TIMEOUT || 30),
  ADMIN_IP_WHITELIST: parseList(env?.VITE_ADMIN_IP_WHITELIST || env?.ADMIN_IP_WHITELIST || '')
};

function parseList(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
