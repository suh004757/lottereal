from pathlib import Path
import re
import unittest


REPO = Path(__file__).resolve().parents[1]
PUBLIC_FILES = (
    'corporate-buildings.html',
    'songpa-samgong-building.html',
    'content/listings/2026-09-01-samgong-building.json',
)


def assert_only_approved_public_amounts(testcase, text):
    eok_values = {int(value.replace(',', '')) for value in re.findall(r'(?<!\d)([\d,]{2,})\s*억', text)}
    testcase.assertTrue(eok_values.issubset({350}), f'승인되지 않은 억 단위 금액: {sorted(eok_values - {350})}')
    compact = text.replace(',', '')
    long_values = set(re.findall(r'(?<!\d)\d{10,12}(?!\d)', compact))
    testcase.assertTrue(
        long_values.issubset({'35000000000', '050714025055'}),
        '승인되지 않은 장기 숫자형 금액 또는 연락처가 있습니다',
    )


class CorporateBuildingsTest(unittest.TestCase):
    def test_public_hub_and_detail_expose_only_approved_listing_facts(self):
        hub_path = REPO / 'corporate-buildings.html'
        detail_path = REPO / 'songpa-samgong-building.html'
        image_path = REPO / 'img' / 'properties' / 'samgong-building-fact-card.jpg'
        restricted_source_image = REPO / 'img' / 'properties' / 'samgong-building-front.jpg'

        self.assertTrue(hub_path.exists(), '기업 사옥 허브가 필요합니다')
        self.assertTrue(detail_path.exists(), '삼공빌딩 정적 상세페이지가 필요합니다')
        self.assertTrue(image_path.exists(), '자체 제작한 사실 카드 이미지가 필요합니다')
        self.assertFalse(restricted_source_image.exists(), 'PDF 추출 외관 사진은 공개 배포하지 않습니다')

        hub = hub_path.read_text(encoding='utf-8')
        detail = detail_path.read_text(encoding='utf-8')
        public_copy = '\n'.join((hub, detail))

        self.assertIn('<link rel="canonical" href="https://lottes.co.kr/corporate-buildings.html">', hub)
        self.assertIn('<link rel="canonical" href="https://lottes.co.kr/songpa-samgong-building.html">', detail)
        for page in (hub, detail):
            self.assertNotIn('hreflang="en"', page)
            self.assertNotIn('hreflang="ja"', page)
        self.assertIn('js/privacyAnalytics.js', hub)
        self.assertIn('js/privacyAnalytics.js', detail)
        self.assertIn('js/analyticsEvents.js', hub)
        self.assertIn('js/analyticsEvents.js', detail)

        for approved in (
            '350억',
            '서울특별시 송파구 위례성대로 98',
            '대지 329.12평',
            '연면적 586.33평',
            '자주식 주차 14대',
            '엘리베이터 없음',
            '1996년 9월 18일',
            '지하 1층 92.25평',
            '주출입구 기준 남동향',
            '5호선 방이역',
        ):
            self.assertIn(approved, public_copy)

        self.assertNotIn('공동중개', public_copy)
        self.assertIn('기업 사옥 매매', hub)
        self.assertIn('최신 매물 상태와 답사 가능 여부', hub)
        assert_only_approved_public_amounts(self, public_copy)

        self.assertNotIn('영구 올림픽공원', public_copy)
        self.assertNotIn('안전한 투자', public_copy)
        self.assertNotIn('수익 보장', public_copy)

        hero = detail[detail.index('<section class="building-hero">'):detail.index('</section>', detail.index('<section class="building-hero">'))]
        self.assertIn('엘리베이터 없음', hero)
        self.assertIn('주출입구 기준 남동향', hero)
        self.assertIn('5호선 방이역', hero)
        ledger = detail[detail.index('<section class="building-ledger">'):detail.index('</section>', detail.index('<section class="building-ledger">'))]
        self.assertEqual(ledger.count('<div>'), 6)
        self.assertIn('class="building-jump"', detail)
        for anchor in ('#building-facts', '#building-stack', '#fit-check', '#inquiry'):
            self.assertIn(f'href="{anchor}"', detail)
        for status in ('확인됨', '협의 필요', '공적장부 재확인', '현장 실사 필요'):
            self.assertIn(status, detail)

        hub_hero = hub[hub.index('<section class="hq-hero">'):hub.index('</section>', hub.index('<section class="hq-hero">'))]
        for summary in ('현재 공개 1건', '방이동 삼공빌딩', '350억', '연면적 586.33평', '주차 14대', '엘리베이터 없음'):
            self.assertIn(summary, hub_hero)

    def test_fit_tool_is_local_private_and_flags_hard_constraints(self):
        detail = (REPO / 'songpa-samgong-building.html').read_text(encoding='utf-8')
        page_js_path = REPO / 'js' / 'corporateBuildingFit.js'
        evaluator_path = REPO / 'js' / 'utils' / 'corporateBuildingFit.mjs'

        self.assertIn('적합성 확인만으로 저장하거나 전송하지 않습니다', detail)
        self.assertIn('검토하고 동의해 접수할 때만', detail)
        self.assertNotIn('입력값은 저장하거나 전송하지 않습니다', detail)
        self.assertIn('id="corporate-fit-form"', detail)
        self.assertIn('id="corporate-fit-result"', detail)
        self.assertIn('aria-live="polite"', detail)
        self.assertIn('js/corporateBuildingFit.js', detail)
        self.assertIn('data-corporate-inquiry', detail)
        hub = (REPO / 'corporate-buildings.html').read_text(encoding='utf-8')
        self.assertIn('js/corporateBuildingFit.js', hub)
        self.assertIn('data-corporate-inquiry', hub)
        self.assertTrue(page_js_path.exists())
        self.assertTrue(evaluator_path.exists())

        form = detail[detail.index('id="corporate-fit-form"'):detail.index('</form>', detail.index('id="corporate-fit-form"'))]
        for private_field in ('name="name"', 'name="phone"', 'name="email"', 'name="company"'):
            self.assertNotIn(private_field, form)

        page_js = page_js_path.read_text(encoding='utf-8')
        self.assertIn("'lottereal:open-inquiry'", page_js)
        self.assertIn("listingId: '4b2080fa-ebc5-4363-a801-ca1be33add3e'", page_js)
        self.assertIn('삼공빌딩 문의하기', page_js)
        self.assertNotIn('이 조건으로 문의하기', page_js)
        self.assertIn('inquiryDraft:', page_js)
        inquiry_chat = (REPO / 'js' / 'inquiryChat.js').read_text(encoding='utf-8')
        self.assertIn('event.detail?.inquiryDraft', inquiry_chat)
        self.assertIn('renderMessageForm(state.values.message)', inquiry_chat)
        self.assertIn('escapeHtml(initialValue)', inquiry_chat)
        for transport in ('fetch(', 'localStorage', 'sessionStorage', 'sendBeacon', 'XMLHttpRequest'):
            self.assertNotIn(transport, page_js)

        import subprocess
        script = """
          import { assessCorporateFit } from './js/utils/corporateBuildingFit.mjs';
          const elevator = assessCorporateFit({ useType: 'hq', parkingNeed: 10, elevatorRequired: true });
          const showroom = assessCorporateFit({ useType: 'showroom', parkingNeed: 10, elevatorRequired: false });
          const parking = assessCorporateFit({ useType: 'hq', parkingNeed: 20, elevatorRequired: false });
          console.log(JSON.stringify({ elevator, showroom, parking }));
        """
        result = subprocess.run(
            ['node', '--input-type=module', '--eval', script],
            cwd=REPO,
            text=True,
            capture_output=True,
            check=True,
        )
        import json
        data = json.loads(result.stdout)
        self.assertEqual(data['elevator']['status'], '우선순위 낮음')
        self.assertEqual(data['showroom']['status'], '적합성 검토')
        self.assertEqual(data['parking']['status'], '추가 확인')

    def test_corporate_listing_uses_dedicated_routes_mobile_cta_and_visible_focus(self):
        listings_js = (REPO / 'js' / 'listingsPage.js').read_text(encoding='utf-8')
        detail_js = (REPO / 'js' / 'listingDetail.js').read_text(encoding='utf-8')
        route_util = REPO / 'js' / 'utils' / 'listingRoutes.mjs'
        self.assertTrue(route_util.exists())
        self.assertIn('getListingDetailUrl(item)', listings_js)
        self.assertIn('getListingDetailUrl({ id })', detail_js)

        import subprocess, json
        result = subprocess.run(
            ['node', '--input-type=module', '--eval', """
              import { getListingDetailUrl } from './js/utils/listingRoutes.mjs';
              console.log(JSON.stringify({
                corporate: getListingDetailUrl({ id: '4b2080fa-ebc5-4363-a801-ca1be33add3e' }),
                normal: getListingDetailUrl({ id: 'abc 123' })
              }));
            """], cwd=REPO, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        routes = json.loads(result.stdout)
        self.assertEqual(routes['corporate'], 'songpa-samgong-building.html')
        self.assertEqual(routes['normal'], 'listing-detail.html?id=abc%20123')

        for page_name in ('corporate-buildings.html', 'songpa-samgong-building.html'):
            page = (REPO / page_name).read_text(encoding='utf-8')
            self.assertIn('class="lr-mobile-actionbar lr-corporate-actionbar"', page)
            self.assertIn('data-corporate-inquiry', page)
            self.assertIn('href="tel:050714025055"', page)
        css = (REPO / 'css' / 'corporate-buildings.css').read_text(encoding='utf-8')
        self.assertIn(':focus-visible', css)
        self.assertIn('outline: 3px solid', css)
        self.assertRegex(css, r'\.hq-hero\s*\{[^}]*min-height:\s*580px')
        self.assertIn('font-size: clamp(2.8rem, 4.8vw, 3.6rem)', css)
        self.assertIn('min-height: 520px', css)
        self.assertIn('font-size: clamp(2.4rem, 4vw, 4.2rem)', css)
        self.assertIn('@media (max-width: 1100px)', css)
        self.assertNotIn('font-size: clamp(3rem, 6.2vw, 6.7rem)', css)
        self.assertNotIn('font-size: clamp(2.7rem,14vw,4rem)', css)

    def test_corporate_mobile_hero_keeps_korean_words_and_uses_compact_type(self):
        hub = (REPO / 'corporate-buildings.html').read_text(encoding='utf-8')
        css = (REPO / 'css' / 'corporate-buildings.css').read_text(encoding='utf-8')

        self.assertIn('class="hq-headline-line"', hub)
        self.assertIn('<em>독립 사옥</em>을 제안합니다', hub)
        self.assertNotIn('<em>독립 사옥</em>을 찾습니다', hub)
        mobile = css[css.index('@media (max-width: 640px)'):]
        hero_rule = re.search(r'\.hq-hero__copy h1\s*\{([^}]*)\}', mobile)
        if hero_rule is None:
            self.fail('모바일 기업 사옥 제목 규칙이 필요합니다')
        declarations = hero_rule.group(1)
        self.assertIn('font-size: clamp(2rem, 8.8vw, 2.35rem)', declarations)
        self.assertIn('line-height: 1.15', declarations)
        self.assertIn('word-break: keep-all', declarations)
        self.assertIn('overflow-wrap: normal', declarations)

    def test_large_commercial_price_uses_eok_not_raw_manwon(self):
        import subprocess
        script = """
          import { formatListingPrice } from './js/utils/propertyPrice.mjs';
          console.log(JSON.stringify({
            sale: formatListingPrice(3500000, '사옥 매매'),
            plain: formatListingPrice(3500000, ''),
            mixed: formatListingPrice(3512500, '매매')
          }));
        """
        result = subprocess.run(
            ['node', '--input-type=module', '--eval', script],
            cwd=REPO,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        import json
        data = json.loads(result.stdout)
        self.assertEqual(data['sale'], '매매 350억')
        self.assertEqual(data['plain'], '350억')
        self.assertEqual(data['mixed'], '매매 351억 2,500만원')

    def test_listing_is_discoverable_and_payload_matches_public_price(self):
        import json
        payload_path = REPO / 'content' / 'listings' / '2026-09-01-samgong-building.json'
        payload = json.loads(payload_path.read_text(encoding='utf-8'))
        listing_id = '4b2080fa-ebc5-4363-a801-ca1be33add3e'

        self.assertEqual(payload['id'], listing_id)
        self.assertEqual(payload['price'], 3_500_000)
        self.assertEqual(payload['currency'], 'KRW')
        self.assertEqual(payload['property_type'], '사옥 매매')
        self.assertEqual(payload['address'], '위례성대로 98')
        self.assertEqual(payload['contact_name'], '롯데공인중개사사무소')
        self.assertEqual(payload['contact_phone'], '050714025055')
        self.assertIsNone(payload['contact_email'])

        detail = (REPO / 'songpa-samgong-building.html').read_text(encoding='utf-8')
        hub = (REPO / 'corporate-buildings.html').read_text(encoding='utf-8')
        home = (REPO / 'index.html').read_text(encoding='utf-8')
        listings = (REPO / 'listings.html').read_text(encoding='utf-8')
        sitemap = (REPO / 'Sitemap.xml').read_text(encoding='utf-8')

        self.assertIn('"price": "35000000000"', detail)
        for broker_fact in (
            '롯데공인중개사사무소',
            '개업공인중개사 서봉현',
            '중개사무소등록번호 11710-2018-00141',
            '상담·광고 전화 0507-1402-5055',
            '서울특별시 송파구 백제고분로27길 27 101호',
        ):
            self.assertIn(broker_fact, detail)
        self.assertNotIn('등록 전화 02-', detail)
        self.assertGreaterEqual(detail.count('data-corporate-inquiry'), 2)
        self.assertGreaterEqual(hub.count('data-corporate-inquiry'), 1)
        self.assertIn('href="corporate-buildings.html"', home)
        self.assertIn('href="corporate-buildings.html"', listings)
        self.assertIn('<option value="사옥 매매">사옥 매매</option>', listings)
        self.assertEqual(sitemap.count('<loc>https://lottes.co.kr/corporate-buildings.html</loc>'), 1)
        self.assertEqual(sitemap.count('<loc>https://lottes.co.kr/songpa-samgong-building.html</loc>'), 1)

        feature_text = '\n'.join((payload_path.read_text(encoding='utf-8'), detail, hub))
        assert_only_approved_public_amounts(self, feature_text)


if __name__ == '__main__':
    unittest.main()
