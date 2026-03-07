const DEFAULT_SITE_NAME = 'Lotte Real Estate';

export function updateSeoMeta({
  title,
  description,
  canonical,
  ogImage,
  type = 'website',
  locale,
  siteName = DEFAULT_SITE_NAME
} = {}) {
  if (title) {
    document.title = title;
    upsertMetaTag({ attr: 'property', key: 'og:title', content: title });
    upsertMetaTag({ attr: 'name', key: 'twitter:title', content: title });
  }

  if (description) {
    upsertMetaTag({ attr: 'name', key: 'description', content: description });
    upsertMetaTag({ attr: 'property', key: 'og:description', content: description });
    upsertMetaTag({ attr: 'name', key: 'twitter:description', content: description });
  }

  if (canonical) {
    upsertCanonical(canonical);
    upsertMetaTag({ attr: 'property', key: 'og:url', content: canonical });
  }

  if (ogImage) {
    upsertMetaTag({ attr: 'property', key: 'og:image', content: ogImage });
    upsertMetaTag({ attr: 'name', key: 'twitter:image', content: ogImage });
  }

  upsertMetaTag({ attr: 'property', key: 'og:type', content: type });
  upsertMetaTag({ attr: 'property', key: 'og:site_name', content: siteName });
  upsertMetaTag({ attr: 'name', key: 'twitter:card', content: 'summary_large_image' });

  if (locale) {
    upsertMetaTag({ attr: 'property', key: 'og:locale', content: locale });
  }
}

export function renderJsonLd({ id, data }) {
  if (!id) return;

  const selector = `script[data-seo-jsonld="${id}"]`;
  let script = document.head.querySelector(selector);

  if (!data) {
    script?.remove();
    return;
  }

  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seoJsonld = id;
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
}

export function buildAbsoluteUrl(pathOrUrl = '') {
  try {
    return new URL(pathOrUrl, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

function upsertCanonical(href) {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = href;
}

function upsertMetaTag({ attr = 'name', key, content }) {
  if (!key || !content) return;

  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}
