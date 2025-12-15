// Centralized application configuration (no window access)
const env = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {});

export const APP_CONFIG = {
  BACKEND_PROVIDER: (env?.VITE_BACKEND_PROVIDER || env?.BACKEND_PROVIDER || 'mock').toLowerCase(),
  API_BASE_URL: env?.VITE_API_URL || env?.API_BASE_URL || '',
  SUPABASE_URL: env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || '',
  SUPABASE_KEY: env?.VITE_SUPABASE_KEY || env?.SUPABASE_KEY || ''
};
