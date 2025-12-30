import { APP_CONFIG } from './config/appConfig.js';
import {
  signInAdmin,
  signOutAdmin,
  getSessionRemainingMs,
  getCurrentSessionUser
} from './services/authService.js';

// DOM refs
const form = document.getElementById('adminLoginForm');
const logoutButton = document.getElementById('logoutButton');
const messageEl = document.getElementById('loginMessage');
const geoButton = document.getElementById('geoButton');
const geoStatus = document.getElementById('geoStatus');
const sessionStatus = document.getElementById('sessionStatus');

let geoData = null;
let authUnavailable = false;

async function init() {
  bindEvents();
  updateSessionStatus();
  setInterval(updateSessionStatus, 1000);

  if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_KEY) {
    authUnavailable = true;
    setMessage('Supabase credentials are missing. Contact an administrator.', 'error');
    toggleFormDisabled(true);
    return;
  }

  try {
    const existingUser = await getCurrentSessionUser();
    if (existingUser) {
      setMessage('Already signed in. Redirecting to dashboard...', 'success');
      window.location.href = './dashboard.html';
    }
  } catch (error) {
    console.error('[Admin] Failed to resolve current session:', error);
    setMessage('Failed to verify the current session.', 'error');
  }
}

function bindEvents() {
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (authUnavailable) {
        setMessage('Supabase authentication is disabled.', 'error');
        return;
      }

      const formData = new FormData(form);
      const email = formData.get('email');
      const password = formData.get('password');

      setMessage('Signing in...', 'info');
      toggleFormDisabled(true);

      try {
        const result = await signInAdmin(email, password, {
          geolocation: geoData,
          userAgent: navigator?.userAgent || '',
          ipAddressHint: null
        });

        if (result.success) {
          setMessage('Login successful. Redirecting...', 'success');
          window.location.href = './dashboard.html';
        } else {
          setMessage(result.error || 'Login failed. Check your credentials.', 'error');
        }
      } catch (error) {
        console.error('[Admin] Login error:', error);
        setMessage(error.message || 'Login failed.', 'error');
      } finally {
        toggleFormDisabled(false);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await signOutAdmin();
        setMessage('Logged out.', 'info');
      } catch (error) {
        console.error('[Admin] Logout error:', error);
        setMessage('Logout failed. See console for details.', 'error');
      }
    });
  }

  if (geoButton) {
    geoButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        geoStatus.textContent = 'Geolocation is not supported.';
        return;
      }
      geoStatus.textContent = 'Requesting location...';
      navigator.geolocation.getCurrentPosition(
        (position) => {
          geoData = position;
          geoStatus.textContent = 'Location attached';
        },
        (error) => {
          console.warn('[Admin] Geolocation error:', error);
          geoStatus.textContent = 'Location denied';
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }
}

function setMessage(text, status = 'info') {
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.dataset.status = status;
}

function toggleFormDisabled(isDisabled) {
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = isDisabled;
  if (geoButton) geoButton.disabled = isDisabled;
}

function updateSessionStatus() {
  if (!sessionStatus) return;
  const remaining = typeof getSessionRemainingMs === 'function' ? getSessionRemainingMs() : null;
  if (remaining === null) {
    sessionStatus.textContent = 'Session idle';
    sessionStatus.classList.remove('expiring');
    return;
  }
  if (remaining <= 0) {
    sessionStatus.textContent = 'Session expired - sign in again';
    sessionStatus.classList.add('expiring');
    return;
  }
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  sessionStatus.textContent = `Time left ${mins}:${secs}`;
  if (remaining < 5 * 60 * 1000) {
    sessionStatus.classList.add('expiring');
  } else {
    sessionStatus.classList.remove('expiring');
  }
}

init().catch((error) => {
  console.error('[Admin] Login bootstrap error:', error);
  setMessage('Failed to initialize login view.', 'error');
  toggleFormDisabled(true);
});
