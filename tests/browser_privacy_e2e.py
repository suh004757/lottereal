#!/usr/bin/env python3
"""Required browser/network regressions for privacy-aware analytics."""

import os
import shutil
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
TARGET_MARKER = "private_target_01012345678"
REFERRER_MARKER = "private_referrer_01098765432"
NAVER_SCRIPT = "https://wcs.pstatic.net/wcslog.js"
NAVER_STUB = """
window.wcs = {};
window.wcs_do = () => fetch(
  '/__naver_capture?href=' + encodeURIComponent(window.location.href) +
  '&referrer=' + encodeURIComponent(document.referrer)
);
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib override signature
        pass

    def do_GET(self):  # noqa: N802 - stdlib override name
        if urlparse(self.path).path == "/__referrer.html":
            target = self.headers.get("X-Test-Target", "")
            body = (
                "<!doctype html><meta name=referrer content=unsafe-url>"
                f'<a id="continue" href="{target}">continue</a>'
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


class PrivacyAnalyticsBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(QuietHandler, directory=str(PUBLIC))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.external_base = f"http://localhost:{cls.server.server_port}"
        browser_home = (
            Path(os.environ.get("RUNNER_TEMP", "/opt/data/cache/scratch"))
            / "lottereal-browser-home"
        )
        for directory in (
            browser_home,
            browser_home / "config",
            browser_home / "cache",
            browser_home / "runtime",
        ):
            directory.mkdir(parents=True, exist_ok=True)
        (browser_home / "runtime").chmod(0o700)
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            headless=True,
            executable_path=cls.chrome_executable(),
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-crash-reporter",
                "--disable-breakpad",
                "--disable-features=Crashpad",
            ],
            env={
                **os.environ,
                "HOME": str(browser_home),
                "XDG_CONFIG_HOME": str(browser_home / "config"),
                "XDG_CACHE_HOME": str(browser_home / "cache"),
                "XDG_RUNTIME_DIR": str(browser_home / "runtime"),
            },
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    @staticmethod
    def chrome_executable():
        candidates = [
            os.environ.get("LOTTEREAL_E2E_CHROME"),
            "/opt/data/cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
            "/opt/data/cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
            "/opt/data/cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
            "/opt/data/cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
            shutil.which("google-chrome"),
            shutil.which("chromium"),
        ]
        executable = next((path for path in candidates if path and Path(path).is_file()), None)
        if not executable:
            raise RuntimeError("Chromium is required for the privacy browser gate")
        return executable

    def new_page(self):
        context = self.browser.new_context()
        page = context.new_page()
        page.route(
            "https://www.googletagmanager.com/**",
            lambda route: route.fulfill(
                status=200, content_type="text/javascript", body=""
            ),
        )
        return context, page

    @staticmethod
    def capture_naver(page, delayed=False):
        captures = []
        pending = []
        provider_requests = []
        page.on(
            "request",
            lambda request: provider_requests.append(request.url)
            if urlparse(request.url).netloc
            in {"www.googletagmanager.com", "wcs.pstatic.net", "wcs.naver.com"}
            else captures.append(request.url)
            if "/__naver_capture" in request.url
            else None,
        )
        if delayed:
            page.route(NAVER_SCRIPT, lambda route: pending.append(route))
        else:
            page.route(
                NAVER_SCRIPT,
                lambda route: route.fulfill(
                    status=200, content_type="text/javascript", body=NAVER_STUB
                ),
            )
        return captures, pending, provider_requests

    def navigate_from_referrer(self, page, source_base):
        target = (
            f"{self.base}/index.html?target={TARGET_MARKER}"
            f"#{TARGET_MARKER}-fragment"
        )
        source = (
            f"{source_base}/__referrer.html?source={REFERRER_MARKER}"
            f"#{REFERRER_MARKER}-fragment"
        )
        page.set_extra_http_headers({"X-Test-Target": target})
        page.goto(source, wait_until="domcontentloaded")
        page.locator("#continue").click()
        page.wait_for_url(target)

    def assert_minimized_naver_capture(self, capture_url, expected_referrer):
        query = parse_qs(urlparse(capture_url).query)
        self.assertEqual(query["href"], [f"{self.base}/index.html"])
        self.assertEqual(query["referrer"], [expected_referrer])
        self.assertNotIn(TARGET_MARKER, capture_url)
        self.assertNotIn(REFERRER_MARKER, capture_url)

    def test_legacy_english_privacy_redirect_stays_untracked_with_consent(self):
        context, page = self.new_page()
        context.add_init_script(
            "localStorage.setItem('lr_analytics_choice', 'allowed')"
        )
        _, _, provider_requests = self.capture_naver(page)

        page.goto(f"{self.base}/privacy_EN.html", wait_until="domcontentloaded")
        page.wait_for_url(f"{self.base}/EN.html#privacy")
        page.wait_for_load_state("networkidle")

        self.assertEqual(page.url, f"{self.base}/EN.html#privacy")
        self.assertTrue(page.locator("#privacy").is_visible())
        self.assertEqual(provider_requests, [])
        self.assertFalse(page.evaluate("LotteRealPrivacy.analyticsEnabled()"))
        context.close()

    def test_same_origin_referrer_is_minimized_after_consent(self):
        context, page = self.new_page()
        captures, _, provider_requests = self.capture_naver(page)
        self.navigate_from_referrer(page, self.base)
        self.assertEqual(provider_requests, [])
        with page.expect_request(lambda request: "/__naver_capture" in request.url):
            page.locator("[data-notice-allow]").click()
        self.assert_minimized_naver_capture(
            captures[0], f"{self.base}/__referrer.html"
        )
        self.assertTrue(any("wcs.pstatic.net" in url for url in provider_requests))
        context.close()

    def test_external_referrer_is_minimized_after_consent(self):
        context, page = self.new_page()
        captures, _, provider_requests = self.capture_naver(page)
        self.navigate_from_referrer(page, self.external_base)
        self.assertEqual(provider_requests, [])
        with page.expect_request(lambda request: "/__naver_capture" in request.url):
            page.locator("[data-notice-allow]").click()
        self.assert_minimized_naver_capture(
            captures[0], f"{self.external_base}/__referrer.html"
        )
        context.close()

    def assert_delayed_naver_pageview_is_blocked(self, change_state):
        context, page = self.new_page()
        captures, pending, provider_requests = self.capture_naver(page, delayed=True)
        page.goto(
            f"{self.base}/index.html?target={TARGET_MARKER}#{TARGET_MARKER}-fragment",
            wait_until="domcontentloaded",
        )
        self.assertEqual(provider_requests, [])
        page.locator("[data-notice-allow]").click()
        page.wait_for_timeout(100)
        self.assertEqual(len(pending), 1)
        change_state(page)
        pending[0].fulfill(
            status=200, content_type="text/javascript", body=NAVER_STUB
        )
        page.wait_for_timeout(250)
        self.assertEqual(captures, [])
        context.close()

    def test_delayed_naver_load_rechecks_consent(self):
        self.assert_delayed_naver_pageview_is_blocked(
            lambda page: page.evaluate("LotteRealPrivacy.setAnalyticsEnabled(false)")
        )

    def test_delayed_naver_load_rechecks_do_not_track(self):
        self.assert_delayed_naver_pageview_is_blocked(
            lambda page: page.evaluate(
                "Object.defineProperty(navigator, 'doNotTrack', "
                "{configurable: true, get: () => '1'})"
            )
        )

    def test_delayed_naver_load_rechecks_privacy_page(self):
        self.assert_delayed_naver_pageview_is_blocked(
            lambda page: page.evaluate(
                "history.replaceState({}, '', '/privacy.html?private=1#private')"
            )
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
