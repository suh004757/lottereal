import shutil
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    from playwright.sync_api import sync_playwright  # type: ignore[import-not-found]
except ImportError:  # Optional browser regression dependency.
    sync_playwright = None

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
CHROME = "/opt/data/cache/ms-playwright/chromium-1234/chrome-linux64/chrome"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 - stdlib override signature
        pass


class ReviewedAnalyticsMobileBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(PUBLIC))
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def launch_browser(self, playwright):
        executable = CHROME if Path(CHROME).exists() else shutil.which("chromium")
        if not executable:
            self.skipTest("Chromium is not installed")
        return playwright.chromium.launch(
            headless=True,
            executable_path=executable,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-crash-reporter",
            ],
            env={
                "HOME": "/opt/data",
                "XDG_CONFIG_HOME": "/opt/data/cache/chrome-config",
                "XDG_CACHE_HOME": "/opt/data/cache/chrome-cache",
            },
        )

    def test_naver_beacon_observes_url_without_query_or_fragment(self):
        if sync_playwright is None:
            self.skipTest("Playwright is not installed")
        with sync_playwright() as playwright:
            browser = self.launch_browser(playwright)
            context = browser.new_context()
            context.add_init_script(
                "localStorage.setItem('lr_analytics_choice', 'allowed')"
            )
            page = context.new_page()
            captures = []
            page.on(
                "request",
                lambda request: captures.append(request.url)
                if "/__naver_capture" in request.url
                else None,
            )
            page.route(
                "https://www.googletagmanager.com/**",
                lambda route: route.fulfill(status=200, content_type="text/javascript", body=""),
            )
            page.route(
                "https://wcs.pstatic.net/wcslog.js",
                lambda route: route.fulfill(
                    status=200,
                    content_type="text/javascript",
                    body=(
                        "window.wcs = {};"
                        "window.wcs_do = () => fetch('/__naver_capture?href=' + "
                        "encodeURIComponent(window.location.href));"
                    ),
                ),
            )

            page.goto(
                self.base + "/index.html?private=01012345678#private-fragment",
                wait_until="domcontentloaded",
            )
            page.wait_for_timeout(500)

            self.assertEqual(len(captures), 1)
            observed = parse_qs(urlparse(captures[0]).query)["href"][0]
            self.assertEqual(observed, self.base + "/index.html")
            browser.close()

    def test_consent_notice_yields_to_modal_and_choice_preserves_inquiry_draft(self):
        if sync_playwright is None:
            self.skipTest("Playwright is not installed")
        with sync_playwright() as playwright:
            browser = self.launch_browser(playwright)
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(self.base + "/index.html", wait_until="domcontentloaded")

            page.locator('.lr-mobile-actionbar a[href*="contact.html#inquiry-options"]').click()
            panel = page.locator('.lr-knowledge-widget__panel')
            self.assertTrue(panel.is_visible())
            self.assertEqual(
                page.locator('[data-analytics-notice]').evaluate(
                    "element => getComputedStyle(element).display"
                ),
                "none",
            )

            panel.locator('[data-chat-choice="callback"]').click()
            panel.locator('[data-chat-choice="website"]').click()
            panel.locator('input[name="name"]').fill("draft name")
            panel.locator('form[data-field="name"] button[type="submit"]').first.click()
            self.assertIn("연락받을 전화번호", panel.inner_text())

            panel.locator('.lr-knowledge-widget__close').click()
            page.locator('[data-analytics-notice]').wait_for(state="visible")
            page.locator('[data-notice-required]').click()
            page.locator('.lr-mobile-actionbar a[href*="contact.html#inquiry-options"]').click()

            self.assertIn("연락받을 전화번호", panel.inner_text())
            self.assertEqual(
                page.evaluate("localStorage.getItem('lr_analytics_choice')"),
                "required-only",
            )
            browser.close()


if __name__ == "__main__":
    unittest.main()
