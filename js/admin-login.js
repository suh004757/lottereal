/**
 * 관리자 로그인 페이지의 JavaScript 모듈
 * 인증, 세션 관리, 지리 위치 수집 기능을 담당합니다.
 */

import { useAuth } from './hooks/useAuth.js';

// DOM 요소 참조
const form = document.getElementById('adminLoginForm');
const logoutButton = document.getElementById('logoutButton');
const messageEl = document.getElementById('loginMessage');
const geoButton = document.getElementById('geoButton');
const geoStatus = document.getElementById('geoStatus');
const sessionStatus = document.getElementById('sessionStatus');

// 지리 위치 데이터 저장 변수
let geoData = null;

/**
 * 페이지 초기화 함수
 * 이벤트 바인딩, 세션 상태 업데이트, 주기적 세션 체크를 시작합니다.
 */
function init() {
  const auth = useAuth();
  bindEvents(auth);
  updateSessionStatus(auth);
  setInterval(() => updateSessionStatus(auth), 1000);
}

/**
 * 이벤트 리스너를 바인딩하는 함수
 * @param {Object} auth - 인증 객체 (useAuth 훅)
 */
function bindEvents(auth) {
  // 로그인 폼 제출 이벤트
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

  // 로그아웃 버튼 이벤트
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await auth.logout();
      setMessage('Logged out.', 'info');
    });
  }

  // 지리 위치 버튼 이벤트
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

/**
 * 메시지를 표시하는 함수
 * @param {string} text - 표시할 메시지 텍스트
 * @param {string} status - 메시지 상태 ('info', 'success', 'error')
 */
function setMessage(text, status = 'info') {
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.dataset.status = status;
}

/**
 * 폼 요소의 비활성화 상태를 토글하는 함수
 * @param {boolean} isDisabled - 비활성화 여부
 */
function toggleFormDisabled(isDisabled) {
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = isDisabled;
  if (geoButton) geoButton.disabled = isDisabled;
}

/**
 * 세션 상태를 업데이트하는 함수
 * @param {Object} auth - 인증 객체
 */
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

// 초기화 실행
init();
