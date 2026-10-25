import os
import shutil
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

try:
    from playwright.sync_api import sync_playwright as _sync_playwright  # type: ignore[import-not-found]
except ImportError:
    _sync_playwright = None


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PLAYWRIGHT_CACHE = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", Path.home() / "cache" / "ms-playwright"))
CACHED_CHROME = next(iter(sorted(PLAYWRIGHT_CACHE.glob("chromium-*/chrome-linux*/chrome"))), None)
CHROME = os.environ.get("LOTTEREAL_E2E_CHROME") or (
    str(CACHED_CHROME) if CACHED_CHROME and CACHED_CHROME.is_file() else shutil.which("google-chrome") or shutil.which("chromium")
)
LISTING_ID = "3c04f5dd-dcb3-46ca-9332-e7cde6f9b421"
LISTING_TITLE = "Songpa Bangi-dong 3-bedroom short-term residential lease"
INQUIRY_DRAFT = "I am asking about the Bangi-dong short-term residential lease: KRW 950,000 weekly rent and maintenance (KRW 850,000 rent + KRW 100,000 maintenance); known one-week contract amount KRW 1,480,000 including refundable KRW 330,000 deposit and KRW 200,000 cleaning fee; utilities separate."


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass


@unittest.skipUnless(_sync_playwright and CHROME, "Playwright and Chromium are required")
class ShortTermRentalBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(PUBLIC)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_responsive_geometry_localized_routes_and_english_prefill(self):
        browser_home = Path(tempfile.mkdtemp(prefix="shortstay-e2e-"))
        self.addCleanup(shutil.rmtree, browser_home, True)
        env = {
            "HOME": str(browser_home),
            "XDG_CONFIG_HOME": str(browser_home / "config"),
            "XDG_CACHE_HOME": str(browser_home / "cache"),
        }
        sync_playwright = _sync_playwright
        if sync_playwright is None:
            self.skipTest("Playwright is unavailable")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=CHROME,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
                env=env,
            )
            for width, height in ((320, 700), (390, 844), (1440, 1000)):
                for route in ("songpa-short-term-rental-en.html", "songpa-short-term-rental-ja.html"):
                    page = browser.new_page(viewport={"width": width, "height": height})
                    page.goto(f"{self.base}/{route}", wait_until="domcontentloaded")
                    self.assertFalse(page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), (route, width))
                    self.assertEqual(page.locator(".shortstay-gallery__item").count(), 13)
                    page.close()

            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.add_init_script("window.localStorage.setItem('lr_analytics_choice', 'allowed');")
            page.goto(f"{self.base}/songpa-short-term-rental-en.html", wait_until="domcontentloaded")
            page.locator("[data-shortstay-inquiry]").first.click()
            open_events = page.evaluate("""() => (window.dataLayer || [])
                .map((entry) => Array.from(entry))
                .filter((entry) => entry[0] === 'event' && entry[1] === 'knowledge_widget_open')""")
            self.assertEqual(len(open_events), 1)
            context = page.locator(".lr-inquiry-chat__listing-context")
            context.wait_for(state="attached")
            self.assertIn(LISTING_TITLE, context.inner_text())
            self.assertIn(LISTING_ID, page.content())
            page.locator('[data-chat-form][data-field="name"] .is-secondary').click()
            phone = page.locator('[data-chat-form][data-field="phone"]')
            phone.locator("input").fill("+82 10 1234 5678")
            phone.locator('button[type="submit"]').click()
            page.locator('[data-chat-choice="anytime"]').click()
            self.assertEqual(page.locator('[data-chat-form][data-field="message"] textarea').input_value(), INQUIRY_DRAFT)
            page.close()

            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.route("**/js/knowledgeWidget.js", lambda route: route.abort())
            page.goto(f"{self.base}/songpa-short-term-rental-en.html", wait_until="domcontentloaded")
            page.locator("[data-shortstay-inquiry]").first.click()
            page.wait_for_timeout(200)
            self.assertEqual(page.evaluate("window.location.pathname"), "/contact.html")
            self.assertEqual(page.evaluate("window.location.hash"), "#inquiry-options")
            page.close()

            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(f"{self.base}/songpa-short-term-rental-ja.html", wait_until="domcontentloaded")
            self.assertGreaterEqual(page.locator('a[href="contact.html#inquiry-options"]').count(), 1)
            self.assertGreaterEqual(page.locator('a[href="tel:050714025055"]').count(), 1)
            self.assertEqual(page.locator("[data-open-guided-inquiry]").count(), 0)
            page.close()
            browser.close()


if __name__ == "__main__":
    unittest.main()
