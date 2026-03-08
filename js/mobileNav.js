document.addEventListener('DOMContentLoaded', () => {
  const navPairs = Array.from(document.querySelectorAll('.lr-header')).map((header) => ({
    header,
    button: header.querySelector('.lr-hamburger'),
    nav: header.querySelector('.lr-nav')
  })).filter((entry) => entry.button && entry.nav);

  if (!navPairs.length) return;

  navPairs.forEach(({ header, button, nav }) => {
    button.setAttribute('aria-expanded', 'false');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = nav.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(isOpen));
      closeOthers(nav);
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeNav(button, nav);
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

  function closeOthers(activeNav) {
    navPairs.forEach(({ button, nav }) => {
      if (nav !== activeNav) {
        closeNav(button, nav);
      }
    });
  }
});

function closeNav(button, nav) {
  nav.classList.remove('is-open');
  button.setAttribute('aria-expanded', 'false');
}
