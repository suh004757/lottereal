document.addEventListener('DOMContentLoaded', () => {
  const navPairs = Array.from(document.querySelectorAll('.lr-header')).map((header) => ({
    header,
    button: header.querySelector('.lr-hamburger'),
    nav: header.querySelector('.lr-nav')
  })).filter((entry) => entry.button && entry.nav);

  if (!navPairs.length) return;

  navPairs.forEach(({ header, button, nav }) => {
    // Initial closed state
    setNavClosed(button, nav);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = nav.classList.toggle('is-open');
      if (isOpen) {
        setNavOpen(button, nav);
      } else {
        setNavClosed(button, nav);
      }
      closeOthers(nav);
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        // 클래스·aria 즉시 제거해서 시각적으로 닫고,
        // inert는 애니메이션 후 설정해서 앵커 내비게이션을 막지 않음
        nav.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        nav.setAttribute('aria-hidden', 'true');
        setTimeout(() => nav.setAttribute('inert', ''), 400);
      });
    });

    document.addEventListener('click', (event) => {
      if (!header.contains(event.target)) {
        closeNav(button, nav);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNav(button, nav);
      }
    });
  });

  function setNavOpen(button, nav) {
    nav.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    nav.removeAttribute('aria-hidden');
    nav.removeAttribute('inert');
  }

  function setNavClosed(button, nav) {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    nav.setAttribute('aria-hidden', 'true');
    nav.setAttribute('inert', '');
  }

  function closeOthers(activeNav) {
    navPairs.forEach(({ button, nav }) => {
      if (nav !== activeNav) {
        closeNav(button, nav);
      }
    });
  }

  function closeNav(button, nav) {
    setNavClosed(button, nav);
  }
});
