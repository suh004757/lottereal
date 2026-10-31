import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
LISTING_ID = "3c04f5dd-dcb3-46ca-9332-e7cde6f9b421"
PHOTO_PREFIX = "https://itcztvceelfvppjwhmvl.supabase.co/storage/v1/object/public/property-images/songpa-bangi-shortstay-20261025-73756206/"
PHOTO_NAMES = (
    "01-living-dining.jpg", "02-dining.jpg", "03-hallway.jpg", "04-kitchen.jpg",
    "05-kitchen-2.jpg", "06-bedroom-1.jpg", "07-bedroom-1b.jpg", "08-bedroom-2.jpg",
    "09-bedroom-3.jpg", "10-bath-1.jpg", "11-bath-2.jpg", "12-laundry.jpg", "13-entry.jpg",
)


class ShortTermRentalLandingTests(unittest.TestCase):
    def setUp(self):
        self.en = (PUBLIC / "songpa-short-term-rental-en.html").read_text(encoding="utf-8")
        self.ja = (PUBLIC / "songpa-short-term-rental-ja.html").read_text(encoding="utf-8")

    def test_pages_publish_verified_listing_facts_and_exact_public_photo_set(self):
        shared_facts = (
            LISTING_ID, "KRW 690,000", "KRW 590,000", "KRW 100,000", "KRW 330,000",
            "KRW 200,000", "52.55", "158-1", "2nd of 4 floors", "2004-05-19",
            "south-facing", "1 car", "Hanseong Baekje", "8 minutes", "Wi-Fi",
        )
        for marker in shared_facts:
            self.assertIn(marker, self.en)

        japanese_facts = (
            LISTING_ID, "690,000ウォン", "590,000ウォン", "100,000ウォン", "330,000ウォン",
            "200,000ウォン", "52.55", "158-1", "2階／地上4階", "2004年5月19日",
            "南向き", "1台", "漢城百済駅", "徒歩約8分", "Wi-Fi",
        )
        for marker in japanese_facts:
            self.assertIn(marker, self.ja)

        expected = {PHOTO_PREFIX + name for name in PHOTO_NAMES}
        for html in (self.en, self.ja):
            actual = set(re.findall(r'<img[^>]+src="(https://[^" ]+)"', html))
            self.assertEqual(actual, expected)
            self.assertEqual(html.count('class="shortstay-gallery__item"'), 13)

    def test_costs_terms_and_unknowns_are_described_as_tenancy_not_booking(self):
        for html in (self.en, self.ja):
            lower = html.lower()
            self.assertNotIn("hotel", lower)
            self.assertNotIn("booking", lower)
            self.assertNotIn("guaranteed", lower)

        for marker in (
            "short-term residential lease", "minimum term of one week", "metered separately",
            "Cancellation terms are provided before the lease is signed", "No smoking indoors",
            "No pets", "reasonable actual cost", "Occupancy limit: please ask",
            "Residence registration or address-reporting eligibility: please ask",
        ):
            self.assertIn(marker, self.en)

        for marker in (
            "短期住宅賃貸借", "最低契約期間は1週間", "使用量に応じて別途精算",
            "解約・キャンセル条件は賃貸借契約の締結前にご案内", "室内禁煙",
            "ペット同伴不可", "合理的な実費", "入居人数の上限：要確認",
            "住居登録・住所変更届の可否：要確認",
        ):
            self.assertIn(marker, self.ja)

    def test_weekly_price_and_known_contract_amount_are_labeled_without_hiding_charges(self):
        self.assertIn("WEEKLY RENT + MAINTENANCE", self.en)
        self.assertIn("Known amount for a one-week contract: <strong>KRW 1,220,000</strong>", self.en)
        self.assertIn("refundable KRW 330,000 deposit", self.en)
        self.assertIn("KRW 200,000 cleaning fee", self.en)
        self.assertIn("Utilities are separate", self.en)
        self.assertNotIn("ONE-WEEK TOTAL", self.en)

        self.assertIn("週額（賃料＋管理費）", self.ja)
        self.assertIn("1週間契約の既知費用：<strong>1,220,000ウォン</strong>", self.ja)
        self.assertIn("返還対象の保証金330,000ウォン", self.ja)
        self.assertIn("清掃費200,000ウォン", self.ja)
        self.assertIn("光熱水費は別途", self.ja)
        self.assertNotIn("1週間の合計", self.ja)

        for html in (self.en, self.ja):
            metadata = "\n".join(re.findall(r'<meta[^>]+(?:name="description"|property="og:description")[^>]+>', html))
            self.assertIn("200,000", metadata)
            self.assertTrue("utilities" in metadata.lower() or "光熱水費" in metadata)

        js = (PUBLIC / "js" / "shortTermRentalInquiry.js").read_text(encoding="utf-8")
        self.assertIn("KRW 200,000 cleaning fee", js)
        self.assertIn("utilities separate", js)

    def test_required_advertising_and_brokerage_fields_are_present(self):
        for html in (self.en, self.ja):
            self.assertIn("183-01-01408", html)
            self.assertIn("11710-2018-00141", html)
            self.assertIn("SUH BONG HYUN", html)
            self.assertIn("0507-1402-5055", html)
            self.assertIn("27 Baekjegobun-ro 27-gil", html)

        self.assertIn("Multifamily housing", self.en)
        self.assertIn("Available for move-in from November 6, 2026", self.en)
        self.assertIn("No elevator", self.en)
        self.assertIn("多世帯住宅", self.ja)
        self.assertIn("2026年11月6日から入居可", self.ja)
        self.assertIn("エレベーターなし", self.ja)

    def test_locale_discovery_sitemap_scoped_styles_and_listing_cta_wiring(self):
        en_home = (PUBLIC / "EN.html").read_text(encoding="utf-8")
        ja_home = (PUBLIC / "JP.html").read_text(encoding="utf-8")
        sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")
        css = (PUBLIC / "css" / "short-term-rental.css").read_text(encoding="utf-8")
        js = (PUBLIC / "js" / "shortTermRentalInquiry.js").read_text(encoding="utf-8")

        self.assertIn('href="songpa-short-term-rental-en.html"', en_home)
        self.assertIn('href="songpa-short-term-rental-ja.html"', ja_home)
        self.assertEqual(sitemap.count("https://lottes.co.kr/songpa-short-term-rental-en.html"), 1)
        self.assertEqual(sitemap.count("https://lottes.co.kr/songpa-short-term-rental-ja.html"), 1)

        for filename, html in (("en", self.en), ("ja", self.ja)):
            self.assertIn('href="css/international.css"', html)
            self.assertIn('href="css/short-term-rental.css"', html)
            self.assertIn('class="intl-page shortstay-page', html)
            self.assertIn('href="tel:050714025055"', html)

        self.assertIn('src="js/shortTermRentalInquiry.js"', self.en)
        self.assertIn('data-shortstay-inquiry', self.en)
        self.assertNotIn('data-open-guided-inquiry', self.en)
        self.assertIn(
            ".shortstay-page--en .shortstay-lead {\n  max-width: min(62ch, 720px);\n}",
            css,
        )
        self.assertNotIn('data-shortstay-inquiry', self.ja)
        self.assertIn('href="contact.html#inquiry-options"', self.ja)

        non_comment_selectors = [line.strip() for line in css.splitlines() if line.strip() and not line.lstrip().startswith("/*") and "{" in line]
        self.assertTrue(non_comment_selectors)
        self.assertTrue(all(selector.startswith(".shortstay-page") or selector.startswith("@") for selector in non_comment_selectors), non_comment_selectors)
        self.assertIn(LISTING_ID, js)
        self.assertIn("lottereal:open-inquiry", js)
        self.assertIn("listingTitle", js)
        self.assertIn("inquiryDraft", js)

    def test_index_pages_list_every_detail_page_with_its_own_weekly_price(self):
        sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")
        for lang, home in (("en", "EN.html"), ("ja", "JP.html")):
            index = (PUBLIC / f"short-term-rentals-{lang}.html").read_text(encoding="utf-8")
            self.assertIn(f'<html lang="{lang}">', index)
            self.assertEqual(sitemap.count(f"https://lottes.co.kr/short-term-rentals-{lang}.html"), 1)
            self.assertIn(f'href="short-term-rentals-{lang}.html"', (PUBLIC / home).read_text(encoding="utf-8"))

            details = sorted(p.name for p in PUBLIC.glob(f"songpa-short-term-rental*-{lang}.html"))
            self.assertTrue(details)
            cards = re.findall(r'<article class="shortstay-listing">(.*?)</article>', index, re.DOTALL)
            linked = {re.search(r'href="([^"]+)"', card).group(1) for card in cards}
            self.assertEqual(linked, set(details))
            for card in cards:
                detail_name = re.search(r'href="([^"]+)"', card).group(1)
                detail = (PUBLIC / detail_name).read_text(encoding="utf-8")
                self.assertIn(f'href="short-term-rentals-{lang}.html"', detail)
                card_price = re.search(r'shortstay-listing__price"><strong>([^<]+)</strong>', card).group(1)
                detail_price = re.search(r'shortstay-price__amount">([^<]+)<', detail).group(1)
                self.assertEqual(card_price, detail_price)
                for fact in ("158-1", "52.55"):
                    self.assertIn(fact, card)

            lower = index.lower()
            for word in ("hotel", "booking", "guaranteed", "check-in", "guest", "宿泊", "ゲスト", "チェックイン"):
                self.assertNotIn(word, lower)
            self.assertIn("11710-2018-00141", index)
            self.assertIn('href="tel:050714025055"', index)


    def test_korean_page_mirrors_listing_facts_and_states_hospital_access_honestly(self):
        ko = (PUBLIC / "songpa-short-term-rental.html").read_text(encoding="utf-8")
        sitemap = (PUBLIC / "Sitemap.xml").read_text(encoding="utf-8")
        self.assertIn('<html lang="ko">', ko)
        self.assertEqual(sitemap.count("https://lottes.co.kr/songpa-short-term-rental.html"), 1)
        self.assertIn('href="songpa-short-term-rental.html"', (PUBLIC / "listings.html").read_text(encoding="utf-8"))

        for marker in (
            LISTING_ID, "69만원", "59만원", "10만원", "33만원", "20만원", "122만원", "52.55", "158-1",
            "2층 / 총 4층", "2004.05.19", "남향", "엘리베이터 없음", "2026년 11월 6일부터 입주 가능", "다세대주택",
            "주택 단기 임대차", "11710-2018-00141", "183-01-01408", "서봉현", 'href="tel:050714025055"',
        ):
            self.assertIn(marker, ko)
        expected = {PHOTO_PREFIX + name for name in PHOTO_NAMES}
        self.assertEqual(set(re.findall(r'<img[^>]+src="(https://[^" ]+)"', ko)), expected)

        hospital = re.search(r'<section class="shortstay-block" id="hospital">(.*?)</section>', ko, re.DOTALL).group(1)
        for marker in ("서울아산병원", "추정치", "제휴 관계가 없습니다", "엘리베이터가 없는 2층"):
            self.assertIn(marker, hospital)
        for word in ("숙박", "입실", "체크인", "게스트", "호텔", "보장합니다"):
            self.assertNotIn(word, ko)

        pages = {"ko-KR": ko, "en": self.en, "ja": self.ja}
        urls = {
            "ko-KR": "https://lottes.co.kr/songpa-short-term-rental.html",
            "en": "https://lottes.co.kr/songpa-short-term-rental-en.html",
            "ja": "https://lottes.co.kr/songpa-short-term-rental-ja.html",
        }
        for html in pages.values():
            for lang, url in urls.items():
                self.assertIn(f'<link rel="alternate" hreflang="{lang}" href="{url}">', html)
        for lang, html in pages.items():
            self.assertIn(f'<link rel="canonical" href="{urls[lang]}">', html)
        self.assertIn("Asan Medical Center", self.en)
        self.assertIn("not affiliated", self.en)
        self.assertIn("ソウル峨山病院", self.ja)
        self.assertIn("提携関係はありません", self.ja)


if __name__ == "__main__":
    unittest.main()
