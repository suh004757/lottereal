// On a computer a tel: link usually can't dial, so a click looked like nothing happened.
// Keep the link (Phone Link / the browser's "call from your phone" can still pick it up),
// and also show the number and copy it, so every click gets a visible answer.
document.addEventListener('DOMContentLoaded', () => {
  const desktop = window.matchMedia('(min-width: 769px) and (pointer: fine)');
  let toast = null;
  let hideTimer = 0;

  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href^="tel:"]');
    if (!link || !desktop.matches) return;
    const number = formatNumber(link.getAttribute('href').slice(4));
    if (!number) return;
    const note = show(number);
    copy(number).then((copied) => {
      if (copied) note.textContent = '번호를 복사했습니다';
    });
  });

  function show(number) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'lr-phone-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = '휴대폰으로 전화해 주세요';
    const strong = document.createElement('strong');
    strong.textContent = number;
    const note = document.createElement('span');
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '×';
    close.addEventListener('click', hide);
    toast.append(label, strong, note, close);
    toast.classList.add('is-open');
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 8000);
    return note;
  }

  function hide() {
    if (toast) toast.classList.remove('is-open');
  }

  function copy(text) {
    if (!navigator.clipboard || !window.isSecureContext) return Promise.resolve(false);
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }

  function formatNumber(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (/^0[57]0\d{9}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
    if (digits.startsWith('02') && digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    return digits.length >= 8 ? digits : '';
  }
});
