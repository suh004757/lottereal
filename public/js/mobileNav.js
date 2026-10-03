document.addEventListener('DOMContentLoaded', () => {
  const mobileQuery = window.matchMedia('(max-width: 768px)');
  const navPairs = Array.from(document.querySelectorAll('.lr-header')).map((header) => ({
    header,
    button: header.querySelector('.lr-hamburger'),
    nav: header.querySelector('.lr-nav')
  })).filter((entry) => entry.button && entry.nav);

  if (!navPairs.length) return;

  navPairs.forEach(({ header, button, nav }, index) => {
    const navId = nav.id || `lr-mobile-nav-${index + 1}`;
    nav.id = navId;
    button.setAttribute('aria-controls', navId);
    button.setAttribute('aria-haspopup', 'true');

    syncNavForViewport(button, nav, mobileQuery.matches);

    button.addEventListener('click', (event) => {
      if (!mobileQuery.matches) return;

      event.preventDefault();
      event.stopPropagation();

      const isOpen = !nav.classList.contains('is-open');
      setNavState(button, nav, isOpen);
      closeOthers(nav);
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (!mobileQuery.matches) return;
        closeNav(button, nav);
      });
    });

    document.addEventListener('click', (event) => {
      if (!mobileQuery.matches) return;
      if (!header.contains(event.target)) {
        closeNav(button, nav);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!mobileQuery.matches) return;
      if (event.key === 'Escape') {
        closeNav(button, nav);
        button.focus();
      }
    });
  });

  const syncAllNavs = (isMobile) => {
    navPairs.forEach(({ button, nav }) => {
      syncNavForViewport(button, nav, isMobile);
    });
    syncBodyState();
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', (event) => {
      syncAllNavs(event.matches);
    });
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener((event) => {
      syncAllNavs(event.matches);
    });
  }

  function syncBodyState() {
    const hasOpenNav = navPairs.some(({ nav }) => nav.classList.contains('is-open'));
    document.body.classList.toggle('lr-nav-open', hasOpenNav && mobileQuery.matches);
  }

  function setNavState(button, nav, isOpen) {
    nav.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
    nav.setAttribute('aria-hidden', String(!isOpen));

    if ('inert' in nav) {
      nav.inert = !isOpen;
    }

    if (isOpen) {
      nav.removeAttribute('inert');
    } else {
      nav.setAttribute('inert', '');
    }

    syncBodyState();
  }

  function syncNavForViewport(button, nav, isMobile) {
    if (isMobile) {
      setNavState(button, nav, false);
      return;
    }

    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    nav.removeAttribute('aria-hidden');
    nav.removeAttribute('inert');

    if ('inert' in nav) {
      nav.inert = false;
    }
  }

  function closeOthers(activeNav) {
    navPairs.forEach(({ button, nav }) => {
      if (nav !== activeNav) {
        closeNav(button, nav);
      }
    });
  }

  function closeNav(button, nav) {
    setNavState(button, nav, false);
  }
});
