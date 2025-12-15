import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { APP_CONFIG } from '../config/appConfig.js';

const SESSION_TIMEOUT_MS = Math.max(1, Number(APP_CONFIG.ADMIN_SESSION_TIMEOUT_MINUTES || 30)) * 60 * 1000;
const SESSION_START_KEY = 'admin_session_started_at';

let supabaseClient = null;
let sessionTimer = null;
let sessionStartedAt = null;

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

function clearSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
  sessionStartedAt = null;
}

function persistSessionStart(value) {
  try {
    localStorage.setItem(SESSION_START_KEY, String(value));
  } catch (_e) {}
}

function loadSessionStart() {
  try {
    const raw = localStorage.getItem(SESSION_START_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (_e) {
    return null;
  }
}

function clearSessionStart() {
  try {
    localStorage.removeItem(SESSION_START_KEY);
  } catch (_e) {}
}

export function getSessionExpiry() {
  if (!sessionStartedAt) return null;
  return new Date(sessionStartedAt + SESSION_TIMEOUT_MS);
}

export function getSessionRemainingMs() {
  if (!sessionStartedAt) return null;
  return Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - sessionStartedAt));
}

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

export function onAuthStateChange(callback) {
  const client = ensureClient();
  return client.auth.onAuthStateChange(callback);
}

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
