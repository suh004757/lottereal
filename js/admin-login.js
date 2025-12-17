import { useAuth } from './hooks/useAuth.js';

const form = document.getElementById('adminLoginForm');
const logoutButton = document.getElementById('logoutButton');
const messageEl = document.getElementById('loginMessage');
const geoButton = document.getElementById('geoButton');
const geoStatus = document.getElementById('geoStatus');
const sessionStatus = document.getElementById('sessionStatus');

let geoData = null;

init();

function init() {
  const auth = useAuth();
  auth.refreshUser();
  bindEvents(auth);
  updateSessionStatus(auth);
  setInterval(() => updateSessionStatus(auth), 1000);
}

function bindEvents(auth) {
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const email = formData.get('email');
      const password = formData.get('password');

      setMessage('Signing in...', 'info');
      toggleFormDisabled(true);

      try {
        const { user, session } = await auth.signIn(email, password);

        if (user) {
          setMessage('Login successful.', 'success');
          // Store session verification in storage if needed for simple page protection
          // Ideally useAuth listener handles this, but for simple redirection:
          window.location.href = './dashboard.html';
        } else {
          setMessage('Login failed. Please check your credentials.', 'error');
        }
      } catch (error) {
        console.error('Login Error:', error);
        setMessage(error.message || 'Login failed.', 'error');
      }

      toggleFormDisabled(false);
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await auth.logout();
      setMessage('Logged out.', 'info');
    });
  }

  if (geoButton) {
    geoButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        geoStatus.textContent = 'Geolocation is not supported in this browser.';
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

function updateSessionStatus(auth) {
  if (!sessionStatus) return;
  const remaining = auth.getSessionRemainingMs ? auth.getSessionRemainingMs() : null;
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
