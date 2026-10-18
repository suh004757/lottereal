from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MOBILE_NAV = ROOT / "public" / "js" / "mobileNav.js"
HOME_JOURNEY = ROOT / "public" / "js" / "homeJourney.js"
MOBILE_CSS = ROOT / "public" / "css" / "mobile.css"


class KakaoWebviewPerformanceTest(unittest.TestCase):
    def test_shared_navigation_bootstraps_the_webview_detector(self):
        source = MOBILE_NAV.read_text(encoding="utf-8")
        self.assertIn("import('/js/webviewPerformance.mjs')", source)

    def test_home_journey_disables_autoplay_in_constrained_webviews(self):
        source = HOME_JOURNEY.read_text(encoding="utf-8")
        self.assertIn("lr-kakao-webview", source)
        self.assertIn("lottereal:webview-performance", source)

    def test_kakao_mode_removes_scroll_paint_hotspots(self):
        css = MOBILE_CSS.read_text(encoding="utf-8")
        self.assertIn("html.lr-kakao-webview", css)
        self.assertIn("backdrop-filter: none !important", css)
        self.assertIn("animation: none !important", css)
        self.assertIn("animation-timeline: auto !important", css)
        self.assertIn(".lr-kakao-webview .lr-mobile-actionbar", css)


if __name__ == "__main__":
    unittest.main()
