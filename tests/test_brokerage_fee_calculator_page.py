import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "brokerage-fee-calculator.html"


class BrokerageFeeCalculatorPageTests(unittest.TestCase):
    def test_page_has_search_metadata_and_local_calculator_controls(self):
        page = PAGE.read_text(encoding="utf-8")
        self.assertIn("<title>서울 부동산 중개보수 계산기", page)
        self.assertIn('rel="canonical" href="https://lottes.co.kr/brokerage-fee-calculator.html"', page)
        self.assertIn('id="brokerage-fee-form"', page)
        self.assertIn('name="propertyType"', page)
        self.assertIn('name="transactionType"', page)
        self.assertIn('id="sale-price"', page)
        self.assertIn('id="deposit"', page)
        self.assertIn('id="monthly-rent"', page)
        self.assertIn('id="fee-result"', page)
        self.assertIn('aria-live="polite"', page)
        self.assertIn('src="js/brokerageFeePage.mjs"', page)
        self.assertNotIn('<form action=', page)

    def test_page_states_ceiling_scope_sources_and_privacy_boundary(self):
        page = PAGE.read_text(encoding="utf-8")
        for phrase in (
            "중개보수 상한액",
            "실제 보수는 상한 이내에서 협의",
            "부가가치세는 별도일 수 있습니다",
            "입력한 금액은 저장하거나 전송하지 않습니다",
            "2026년 9월 21일 확인",
            "서울부동산정보광장",
            "공인중개사법 시행규칙 제20조",
        ):
            self.assertIn(phrase, page)
        self.assertIn('href="contact.html"', page)
        self.assertIn('href="https://land.seoul.go.kr:444/land/broker/brokerageCommission.do"', page)

    def test_page_is_discoverable_without_crowding_primary_navigation(self):
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        knowledge = (ROOT / "knowledge.html").read_text(encoding="utf-8")
        sitemap = (ROOT / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn('href="brokerage-fee-calculator.html"', index)
        self.assertIn('href="brokerage-fee-calculator.html"', knowledge)
        self.assertIn("https://lottes.co.kr/brokerage-fee-calculator.html", sitemap)
        nav_start = index.index('<nav class="lr-nav"')
        nav_end = index.index('</nav>', nav_start)
        self.assertNotIn('brokerage-fee-calculator.html', index[nav_start:nav_end])


if __name__ == "__main__":
    unittest.main()
