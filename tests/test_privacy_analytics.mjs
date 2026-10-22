import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/privacyAnalytics.js', import.meta.url), 'utf8');
const GA_ID = 'G-VPG00DG5V1';

function runtime({
  href = 'https://lottes.example/index.html?private=target#fragment',
  referrer = 'https://search.example/results?private=referrer#fragment',
  expectAnalytics = true,
} = {}) {
  let current = new URL(href);
  const storage = new Map([['lr_analytics_choice', 'allowed']]);
  const scripts = [];
  const location = {};
  for (const field of ['href', 'origin', 'pathname', 'search', 'hash', 'hostname']) {
    Object.defineProperty(location, field, {
      configurable: true,
      get: () => current[field],
    });
  }
  const document = {
    cookie: '',
    documentElement: { lang: 'ko' },
    readyState: 'complete',
    referrer,
    head: { appendChild: (element) => scripts.push(element) },
    createElement: (tagName) => ({
      tagName,
      addEventListener(name, callback) {
        this[`${name}Listener`] = callback;
      },
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const window = {
    document,
    location,
    history: {
      state: null,
      replaceState(state, _title, next) {
        this.state = state;
        current = new URL(next, current);
      },
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const navigator = { doNotTrack: '0' };
  const context = vm.createContext({
    URL,
    Date,
    Object,
    Set,
    encodeURIComponent,
    console,
    document,
    navigator,
    window,
  });
  vm.runInContext(source, context);
  const naverScript = scripts.find((script) => script.src === 'https://wcs.pstatic.net/wcslog.js');
  if (expectAnalytics) {
    assert.ok(naverScript, 'Naver script should be queued for an allowed preference');
  }
  return { document, navigator, naverScript, scripts, storage, window };
}

const privacyEnglish = fs.readFileSync(new URL('../public/privacy_EN.html', import.meta.url), 'utf8');

test('legacy English privacy route remains analytics-suppressed after redirect', () => {
  const redirect = privacyEnglish.match(/http-equiv="refresh" content="0; url=([^";]+)"/i);
  assert.ok(redirect, 'privacy_EN.html should retain a redirect for legacy links');

  const destination = new URL(redirect[1], 'https://lottes.example/privacy_EN.html');
  const env = runtime({ href: destination.href, expectAnalytics: false });

  assert.equal(destination.pathname, '/EN.html');
  assert.equal(destination.hash, '#privacy');
  assert.equal(env.window.LotteRealPrivacy.analyticsEnabled(), false);
  assert.deepEqual(env.scripts, []);
});

test('Naver minimizes an external referrer before the provider reads it', () => {
  const env = runtime();
  let observed;
  env.window.wcs = {};
  env.window.wcs_do = () => {
    observed = {
      href: env.window.location.href,
      referrer: env.document.referrer,
    };
  };

  env.naverScript.loadListener();

  assert.deepEqual(observed, {
    href: 'https://lottes.example/index.html',
    referrer: 'https://search.example/results',
  });
  assert.equal(env.window.location.href, 'https://lottes.example/index.html?private=target#fragment');
  assert.equal(env.document.referrer, 'https://search.example/results?private=referrer#fragment');
});

for (const [state, changeState] of [
  ['consent', (env) => env.window.LotteRealPrivacy.setAnalyticsEnabled(false)],
  ['Do Not Track', (env) => Object.defineProperty(env.navigator, 'doNotTrack', { configurable: true, get: () => '1' })],
  ['privacy page', (env) => env.window.history.replaceState({}, '', '/privacy.html?private=1#private')],
]) {
  test(`Naver delayed load re-checks current ${state} state`, () => {
    const env = runtime();
    let pageviews = 0;
    env.window.wcs = {};
    env.window.wcs_do = () => { pageviews += 1; };
    changeState(env);

    env.naverScript.loadListener();

    assert.equal(pageviews, 0);
  });
}

test('opt-out still disables the configured Google property', () => {
  const env = runtime();
  env.window.LotteRealPrivacy.setAnalyticsEnabled(false);
  assert.equal(env.window[`ga-disable-${GA_ID}`], true);
});
