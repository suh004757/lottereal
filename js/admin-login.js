import { APP_CONFIG } from './config/appConfig.js';
import {
  signInAdminWithGoogle,
  isGoogleSignInAvailable,
  signOutAdmin,
  getCurrentSessionUser
} from './services/authService.js';

const googleLoginButton = document.getElementById('googleLoginButton');
const googleLoginButtonText = document.getElementById('googleLoginButtonText');
const messageEl = document.getElementById('loginMessage');

let authUnavailable = true;

async function init() {
  bindEvents();

  if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_KEY) {
    setButtonUnavailable();
    setMessage('로그인 서비스를 불러오지 못했습니다. 관리자에게 문의해 주세요.', 'error');
    return;
  }

  try {
    const existingUser = await getCurrentSessionUser();
    if (existingUser?.app_metadata?.role === 'admin') {
      setMessage('관리자 확인 완료. 관리 화면으로 이동합니다.', 'success');
      window.location.href = './intake.html';
      return;
    }
    if (existingUser) {
      await signOutAdmin();
      setMessage('관리자 권한이 없는 계정입니다.', 'error');
    }

    const googleAvailable = await isGoogleSignInAvailable();
    if (!googleAvailable) {
      setButtonUnavailable();
      setMessage('현재 Google 로그인을 사용할 수 없습니다. 관리자에게 문의해 주세요.', 'error');
      return;
    }

    authUnavailable = false;
    googleLoginButton.disabled = false;
    googleLoginButtonText.textContent = 'Google 계정으로 계속';
  } catch (error) {
    console.error('[Admin] Failed to initialize Google login:', error);
    setButtonUnavailable();
    setMessage('로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
  }
}

function bindEvents() {
  googleLoginButton?.addEventListener('click', async () => {
    if (authUnavailable || googleLoginButton.disabled) return;

    setMessage('Google 로그인 화면으로 이동합니다.', 'info');
    googleLoginButton.disabled = true;
    googleLoginButtonText.textContent = 'Google로 이동 중';

    try {
      const result = await signInAdminWithGoogle();
      if (!result.success) {
        setMessage(result.error || 'Google 로그인을 시작하지 못했습니다.', 'error');
        restoreGoogleButton();
      }
    } catch (error) {
      console.error('[Admin] Google login error:', error);
      setMessage('Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.', 'error');
      restoreGoogleButton();
    }
  });
}

function restoreGoogleButton() {
  if (authUnavailable || !googleLoginButton) return;
  googleLoginButton.disabled = false;
  googleLoginButtonText.textContent = 'Google 계정으로 계속';
}

function setButtonUnavailable() {
  authUnavailable = true;
  if (googleLoginButton) googleLoginButton.disabled = true;
  if (googleLoginButtonText) googleLoginButtonText.textContent = 'Google 로그인 사용 불가';
}

function setMessage(text, status = 'info') {
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.dataset.status = status;
}

init().catch((error) => {
  console.error('[Admin] Login bootstrap error:', error);
  setButtonUnavailable();
  setMessage('로그인 화면을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
});
