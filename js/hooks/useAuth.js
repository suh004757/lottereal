import {
  getCurrentSessionUser,
  getSessionExpiry,
  getSessionRemainingMs,
  onAuthStateChange,
  signInAdmin,
  signOutAdmin
} from '../services/authService.js';

let cachedUser = null;
hydrateUser();

export function useAuth() {
  return {
    user: cachedUser,
    isAuthenticated: Boolean(cachedUser),
    login: loginAdmin,
    logout: logoutAdmin,
    refreshUser,
    onAuthStateChange,
    getSessionExpiry,
    getSessionRemainingMs
  };
}

async function loginAdmin(email, password, options = {}) {
  const result = await signInAdmin(email, password, options);
  if (result?.user) cachedUser = result.user;
  return result;
}

async function logoutAdmin(options = {}) {
  await signOutAdmin(options);
  cachedUser = null;
}

async function refreshUser() {
  cachedUser = await getCurrentSessionUser();
  return cachedUser;
}

async function hydrateUser() {
  cachedUser = await getCurrentSessionUser();
}
