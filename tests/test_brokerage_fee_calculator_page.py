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
        self.assertIn('data-result-vat', page)
        self.assertIn('data-result-total-with-vat', page)
        self.assertIn('부가세 10% 가정액', page)
        self.assertIn('10% 포함 예상 합계', page)
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
        self.assertIn("서울특별시에 중개사무소를 둔", page)
        self.assertNotIn("서울 소재 거래의", page)

    def test_mobile_consent_notice_cannot_cover_a_fixed_calculator_cta(self):
        page = PAGE.read_text(encoding="utf-8")
        self.assertNotIn('class="lr-fab"', page)

    def test_amount_inputs_and_live_targets_expose_units_hints_and_focus(self):
        page = PAGE.read_text(encoding="utf-8")
        for field, hint, label in (
            ("sale-price", "sale-price-hint", "매매가격 (만원)"),
            ("deposit", "deposit-hint", "보증금 (만원)"),
            ("monthly-rent", "monthly-rent-hint", "월세 (만원)"),
        ):
            self.assertIn(f'id="{field}"', page)
            self.assertIn(f'aria-label="{label}"', page)
            self.assertIn(f'aria-describedby="{hint} fee-form-error"', page)
            self.assertIn(f'id="{hint}"', page)
        self.assertIn('id="fee-result" class="fee-result" tabindex="-1"', page)
        self.assertIn('id="fee-form-error" class="fee-form__error" role="alert" tabindex="-1"', page)

    def test_dark_result_card_keeps_all_primary_copy_readable(self):
        css = (ROOT / "css" / "brokerage-fee-calculator.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\.fee-result__empty h2\s*\{[^}]*color:\s*#fff")
        self.assertRegex(css, r"\.fee-result__empty > p:last-child\s*\{[^}]*color:\s*rgba\(255,255,255,")

    def test_printed_result_resets_total_to_high_contrast_black(self):
        css = (ROOT / "css" / "brokerage-fee-calculator.css").read_text(encoding="utf-8")
        print_css = css[css.index("@media print") :]
        self.assertRegex(print_css, r"\.fee-breakdown__total dd[^}]*\{[^}]*color:\s*#000")

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
