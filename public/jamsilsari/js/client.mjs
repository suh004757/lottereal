import '../../js/vendor/supabase-2.45.4.min.js';
import {APP_CONFIG} from '../../js/config/appConfig.js';
import {ENABLE_CONTRACTS,ENABLE_SIGN_IN} from './config.mjs';
const clients = new Map();
export function getClient(member = false) {
  if (member && !ENABLE_SIGN_IN) throw new Error('Sign-in disabled');
  if (!clients.has(member)) clients.set(member,globalThis.supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_KEY,{
    auth:{storageKey:member ? 'jamsilsari-member-session' : 'jamsilsari-anon',persistSession:member,
      autoRefreshToken:member,detectSessionInUrl:member,flowType:'pkce'},
  }));
  return clients.get(member);
}

// Bind one private operation to the reviewed identity's JWT, not a later tab's session.
export function contractDataClient(accessToken) {
  if (!ENABLE_SIGN_IN || !ENABLE_CONTRACTS || !accessToken) throw new Error('Contract session unavailable');
  return globalThis.supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_KEY,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{storageKey:'jamsilsari-contract-memory',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}
