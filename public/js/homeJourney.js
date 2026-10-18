(() => {
  const root = document.querySelector('[data-journey]');
  if (!root) return;

  const steps = Array.from(root.querySelectorAll('[data-journey-step]'));
  const scenes = Array.from(root.querySelectorAll('[data-journey-scene]'));
  const toggle = root.querySelector('[data-journey-toggle]');
  const copy = root.querySelector('[data-journey-copy]');
  if (!steps.length) return;

  const renderCopy = (step, index) => {
    if (!copy) return;
    const title = step.querySelector('strong');
    const text = step.querySelector(':scope > span:last-child');
    copy.querySelector('[data-journey-copy-index]').textContent = String(index + 1).padStart(2, '0');
    copy.querySelector('[data-journey-copy-title]').textContent = title ? title.textContent : '';
    copy.querySelector('[data-journey-copy-text]').textContent = text ? text.textContent : '';
    copy.classList.remove('is-changing');
    void copy.offsetWidth;
    copy.classList.add('is-changing');
  };

  const INTERVAL_MS = 3600;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0;
  let timer = null;
  let inView = false;
  let pausedByUser = false;

  const isConstrainedWebview = () => document.documentElement.classList.contains('lr-kakao-webview');

  const setActive = (index) => {
    active = (index + steps.length) % steps.length;
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === active);
      step.classList.toggle('is-done', i < active);
      if (i === active) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === active));
    renderCopy(steps[active], active);
    root.style.setProperty('--journey-progress', String(steps.length > 1 ? active / (steps.length - 1) : 0));
  };

  const canAutoplay = () => inView
    && !pausedByUser
    && !reducedMotion.matches
    && !isConstrainedWebview()
    && !document.hidden;

  const sync = () => {
    const autoplaying = canAutoplay();
    root.classList.toggle('is-motion-paused', !autoplaying);
    if (autoplaying) {
      if (!timer) timer = window.setInterval(() => setActive(active + 1), INTERVAL_MS);
    } else if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    if (toggle) {
      toggle.hidden = reducedMotion.matches || isConstrainedWebview();
      toggle.setAttribute('aria-pressed', String(pausedByUser));
      toggle.setAttribute('aria-label', pausedByUser ? '자동 재생' : '자동 재생 멈춤');
      toggle.firstElementChild.textContent = pausedByUser ? '▶' : '❚❚';
    }
  };

  steps.forEach((step, i) => {
    step.addEventListener('click', () => {
      pausedByUser = true;
      setActive(i);
      sync();
    });
  });

  if (toggle) {
    toggle.addEventListener('click', () => {
      pausedByUser = !pausedByUser;
      sync();
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      sync();
    }, { threshold: 0.35 }).observe(root);
  } else {
    inView = true;
  }

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('lottereal:webview-performance', sync);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', sync);

  setActive(0);
  sync();
})();
