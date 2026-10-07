import os
import shutil
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
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=CHROME,
                args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
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
            self.assertTrue(search.is_focused())
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
            self.assertEqual(params['topic_labels'], [])
            self.assertEqual(params['guide_locale'], 'en')
            self.assertNotIn(SENSITIVE_MARKER, str(search_event))

            page.keyboard.press('Escape')
            self.assertTrue(trigger.is_focused())
            page.locator('[data-open-guided-inquiry]').first.click()
            page.locator('[data-choice][data-value="consultation"]').click()
            page.locator('[data-choice][data-value="website"]').click()
            page.locator('[data-choice][data-value="anytime"]').click()
            page.locator('[data-chat-form][data-field="name"] [data-skip]').click()
            phone_form = page.locator('[data-chat-form][data-field="phone"]')
            phone_form.locator('input').fill('+82 10 1234 5678')
            phone_form.locator('button[type="submit"]').click()
            page.locator('[data-chat-form][data-field="message"] [data-skip]').click()
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
                geometry = page.evaluate("""() => {
                    const notice = document.querySelector('[data-analytics-notice]').getBoundingClientRect();
                    const bar = document.querySelector('.lr-mobile-actionbar').getBoundingClientRect();
                    const links = [...document.querySelectorAll('.lr-mobile-actionbar a')];
                    return {
                        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                        gap: bar.top - notice.bottom,
                        heights: links.map((link) => link.getBoundingClientRect().height),
                        emojiHidden: links.every((link) => link.querySelector('span')?.getAttribute('aria-hidden') === 'true'),
                    };
                }""")
                self.assertFalse(geometry['overflow'], geometry)
                self.assertGreaterEqual(geometry['gap'], 0, geometry)
                self.assertGreaterEqual(min(geometry['heights']), 44, geometry)
                self.assertTrue(geometry['emojiHidden'], geometry)
                context.close()

            browser.close()
