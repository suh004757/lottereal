// Web font stylesheets are linked with media="print" so they do not hold up the first
// paint (the CSP forbids inline onload handlers); they switch on once loaded.
(function () {
  'use strict';

  document.querySelectorAll('link[data-async-style]').forEach((link) => {
    const enable = () => {
      link.media = 'all';
    };
    if (link.sheet) enable();
    else link.addEventListener('load', enable, { once: true });
  });
})();
