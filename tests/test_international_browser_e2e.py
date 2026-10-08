import os
import shutil
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from typing import Any
from urllib.parse import urlparse

try:
    from playwright.sync_api import sync_playwright as _sync_playwright  # type: ignore[import-not-found]
except ImportError:  # Optional local E2E dependency; CI reports an explicit skip.
    _sync_playwright = None

sync_playwright: Any = _sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
CACHED_CHROME = Path('/opt/data/cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
CHROME = os.environ.get('LOTTEREAL_E2E_CHROME') or (
    str(CACHED_CHROME) if CACHED_CHROME.is_file() else shutil.which('google-chrome') or shutil.which('chromium')
)
E2E_REQUIRED = os.environ.get('LOTTEREAL_E2E_REQUIRED') == '1'
if E2E_REQUIRED and not sync_playwright:
    raise RuntimeError('LOTTEREAL_E2E_REQUIRED=1 but Playwright is unavailable')
if E2E_REQUIRED and not CHROME:
    raise RuntimeError('LOTTEREAL_E2E_REQUIRED=1 but no Chromium executable is available')
SENSITIVE_MARKER = 'SENSITIVE_SEARCH_MARKER_94821'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib override signature
        pass


def is_tracking_url(url):
    host = urlparse(url).netloc
    return 'googletagmanager.com' in host or 'google-analytics.com' in host or 'wcs' in host


@unittest.skipUnless(sync_playwright and CHROME, 'Playwright and a Chromium executable are required for browser E2E')
class InternationalGuideBrowserE2ETest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ('127.0.0.1', 0),
            partial(QuietHandler, directory=str(PUBLIC)),
        )
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def new_context(self, browser, viewport=None, analytics_choice=None):
        context = browser.new_context(
            viewport=viewport or {'width': 1280, 'height': 900},
            locale='en-US',
        )
        if analytics_choice:
            context.add_init_script(
                f"window.localStorage.setItem('lr_analytics_choice', {analytics_choice!r});"
            )
        return context

    def test_english_widget_privacy_consent_focus_csp_and_mobile_geometry(self):
        requested_home = os.environ.get('LOTTEREAL_E2E_BROWSER_HOME')
        browser_home = Path(requested_home) if requested_home else Path(tempfile.mkdtemp(prefix='lottereal-e2e-'))
        if not requested_home:
            self.addCleanup(shutil.rmtree, browser_home, True)
        browser_config = browser_home / 'cache' / 'chrome-config'
        browser_cache = browser_home / 'cache' / 'chrome-cache'
        browser_config.mkdir(parents=True, exist_ok=True)
        browser_cache.mkdir(parents=True, exist_ok=True)
        browser_env = {
            'HOME': str(browser_home),
            'XDG_CONFIG_HOME': str(browser_config),
            'XDG_CACHE_HOME': str(browser_cache),
        }
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=CHROME,
                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-crash-reporter'],
                env=browser_env,
            )

            context = self.new_context(browser)
            page = context.new_page()
            tracking_requests = []
            console_errors = []
            page.on('request', lambda request: tracking_requests.append(request.url) if is_tracking_url(request.url) else None)
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)

            page.goto(f'{self.base}/EN.html?private_test={SENSITIVE_MARKER}', wait_until='domcontentloaded')
            page.locator('[data-open-rental-safety]').first.wait_for()
            self.assertEqual(tracking_requests, [])
            self.assertTrue(page.locator('[data-analytics-notice]').is_visible())

            with page.expect_navigation(wait_until='domcontentloaded'):
                page.locator('[data-notice-allow]').click()
            page.locator('[data-open-rental-safety]').first.wait_for()
            self.assertTrue(any('googletagmanager.com' in url for url in tracking_requests))
            self.assertTrue(all(SENSITIVE_MARKER not in url for url in tracking_requests))

            trigger = page.locator('[data-open-rental-safety]').first
            trigger.focus()
            page.keyboard.press('Enter')
            search = page.locator('.lr-knowledge-widget__form input')
            self.assertTrue(search.evaluate('(element) => element === document.activeElement'))
            search.fill(SENSITIVE_MARKER)
            search.press('Enter')
            page.locator('.lr-knowledge-widget__empty').wait_for()

            search_event = page.evaluate("""() => (window.dataLayer || [])
                .map((entry) => Array.from(entry))
                .find((entry) => entry[0] === 'event' && entry[1] === 'knowledge_widget_search')""")
            self.assertIsNotNone(search_event)
            params = search_event[2]
            self.assertEqual(
                set(params),
                {'page_path', 'query_length', 'result_count', 'topic_labels', 'guide_locale'},
            )
            self.assertEqual(params['page_path'], '/EN.html')
            self.assertEqual(params['query_length'], len(SENSITIVE_MARKER))
            self.assertEqual(params['result_count'], 0)
            self.assertEqual(params['topic_labels'], 'unclassified')
            self.assertEqual(params['guide_locale'], 'en')
            self.assertNotIn(SENSITIVE_MARKER, str(search_event))

            page.keyboard.press('Escape')
            self.assertTrue(trigger.evaluate('(element) => element === document.activeElement'))
            page.locator('[data-open-guided-inquiry]').first.click()
            page.locator('[data-chat-choice="consultation"]').click()
            page.locator('[data-chat-choice="website"]').click()
            page.locator('[data-chat-form][data-field="name"] .is-secondary').click()
            phone_form = page.locator('[data-chat-form][data-field="phone"]')
            phone_form.locator('input').fill('+82 10 1234 5678')
            phone_form.locator('button[type="submit"]').click()
            page.locator('[data-chat-choice="anytime"]').click()
            page.locator('[data-chat-form][data-field="message"] .is-secondary').click()
            consent_form = page.locator('[data-chat-form][data-field="privacyConsent"]')
            self.assertFalse(consent_form.evaluate('(form) => form.checkValidity()'))
            self.assertIn('external listing reference', consent_form.inner_text())
            consent_form.locator('input[name="privacyConsent"]').check()
            self.assertTrue(consent_form.evaluate('(form) => form.checkValidity()'))
            self.assertEqual(
                [text for text in console_errors if 'Content Security Policy' in text or 'Refused to' in text],
                [],
            )
            context.close()

            context = self.new_context(browser, analytics_choice='required-only')
            page = context.new_page()
            tracking_requests = []
            page.on('request', lambda request: tracking_requests.append(request.url) if is_tracking_url(request.url) else None)
            page.goto(f'{self.base}/EN.html', wait_until='domcontentloaded')
            page.locator('[data-open-rental-safety]').first.click()
            search = page.locator('.lr-knowledge-widget__form input')
            search.fill(SENSITIVE_MARKER)
            search.press('Enter')
            page.locator('.lr-knowledge-widget__empty').wait_for()
            self.assertEqual(tracking_requests, [])
            self.assertEqual(page.evaluate('typeof window.gtag'), 'undefined')
            context.close()

            for width, height in ((390, 844), (320, 700)):
                context = self.new_context(browser, {'width': width, 'height': height})
                page = context.new_page()
                page.goto(f'{self.base}/EN.html', wait_until='domcontentloaded')
                page.locator('[data-analytics-notice]').wait_for()
                actionbar = page.locator('.intl-mobile-actionbar')
                self.assertFalse(actionbar.evaluate("(element) => element.classList.contains('is-visible')"))
                initial_geometry = page.evaluate("""() => {
                    const notice = document.querySelector('[data-analytics-notice]').getBoundingClientRect();
                    const barStyle = getComputedStyle(document.querySelector('.intl-mobile-actionbar'));
                    return {
                        noticeBottomGap: window.innerHeight - notice.bottom,
                        opacity: barStyle.opacity,
                        visibility: barStyle.visibility,
                    };
                }""")
                self.assertGreaterEqual(initial_geometry['noticeBottomGap'], 0, initial_geometry)
                self.assertLessEqual(initial_geometry['noticeBottomGap'], 32, initial_geometry)
                self.assertEqual(initial_geometry['opacity'], '0', initial_geometry)
                self.assertEqual(initial_geometry['visibility'], 'hidden', initial_geometry)
                page.locator('#scope').scroll_into_view_if_needed()
                page.locator('.intl-mobile-actionbar.is-visible').wait_for(state='attached')
                page.wait_for_timeout(300)
                geometry = page.evaluate("""() => {
                    const notice = document.querySelector('[data-analytics-notice]').getBoundingClientRect();
                    const bar = document.querySelector('.lr-mobile-actionbar').getBoundingClientRect();
                    const actionbarElement = document.querySelector('.lr-mobile-actionbar');
                    const links = [...actionbarElement.querySelectorAll('a')];
                    return {
                        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                        gap: bar.top - notice.bottom,
                        opacity: getComputedStyle(actionbarElement).opacity,
                        colors: links.map((link) => getComputedStyle(link).backgroundColor),
                        heights: links.map((link) => link.getBoundingClientRect().height),
                        textOnly: links.length === 2 && links.every((link) => !link.querySelector('span')),
                    };
                }""")
                self.assertFalse(geometry['overflow'], geometry)
                self.assertGreaterEqual(geometry['gap'], 0, geometry)
                self.assertEqual(geometry['opacity'], '1', geometry)
                self.assertEqual(geometry['colors'], ['rgb(229, 119, 0)', 'rgb(255, 255, 255)'], geometry)
                self.assertGreaterEqual(min(geometry['heights']), 44, geometry)
                self.assertTrue(geometry['textOnly'], geometry)
                context.close()

            browser.close()
