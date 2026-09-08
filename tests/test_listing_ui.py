from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


def korean_pages():
    return [
        path for path in REPO.glob('*.html')
        if '<html lang="ko"' in path.read_text(encoding='utf-8')
    ]


def primary_navigation(html):
    start = html.index('<nav class="lr-nav"')
    end = html.index('</nav>', start)
    return html[start:end]


class ListingUiTest(unittest.TestCase):
    def test_english_home_is_an_international_scope_guide_not_live_inventory(self):
        html = (REPO / 'EN.html').read_text(encoding='utf-8')
        self.assertIn('What we can help you ask about', html)
        self.assertIn('Availability, viewing schedules', html)
        self.assertNotIn('listings-en.html', html)
        self.assertNotIn('data-listing', html)

    def test_legacy_english_listings_moves_to_the_single_guide(self):
        html = (REPO / 'listings-en.html').read_text(encoding='utf-8')
        self.assertIn('<meta name="robots" content="noindex,follow">', html)
        self.assertIn('<meta http-equiv="refresh" content="0; url=EN.html">', html)
        self.assertNotIn('listingsPage.en.js', html)

    def test_public_listing_phone_is_always_the_approved_safe_number(self):
        for relative in (
            'js/listingsPage.js',
            'js/listingDetail.js',
        ):
            source = (REPO / relative).read_text(encoding='utf-8')
            self.assertIn("from './utils/contactPhone.mjs'", source, relative)
            self.assertNotIn('listing.contact_phone', source, relative)
            self.assertNotIn('item.contact_phone', source, relative)

        adapter = (REPO / 'js/services/backendAdapter.js').read_text(encoding='utf-8')
        self.assertIn("from '../utils/contactPhone.mjs'", adapter)
        self.assertIn('contact_phone: SAFE_CONTACT_PHONE', adapter)

    def test_recommended_listing_navigation_link_is_removed_but_home_content_stays(self):
        for path in korean_pages():
            html = path.read_text(encoding='utf-8')
            self.assertNotIn('>추천매물</a>', primary_navigation(html), path.name)
        home = (REPO / 'index.html').read_text(encoding='utf-8')
        listings = (REPO / 'listings.html').read_text(encoding='utf-8')
        self.assertIn('<p class="lr-kicker">매물 유형 찾기</p>', home)
        self.assertNotIn('<strong>추천매물</strong>', listings)

    def test_korean_primary_navigation_omits_process_and_english_links(self):
        for path in korean_pages():
            html = path.read_text(encoding='utf-8')
            nav = primary_navigation(html)
            self.assertNotIn('>진행</a>', nav, path.name)
            self.assertNotIn('>ENGLISH</a>', nav, path.name)

        home = (REPO / 'index.html').read_text(encoding='utf-8')
        self.assertIn('<a href="EN.html">ENGLISH</a>', home[home.index('<footer'):])

    def test_korean_primary_navigation_is_consistent_and_bounded(self):
        expected = ('기업 사옥', '매물 찾기', '시장·정책', '계약 사례', '자료 찾기', '문의·방문')
        for path in korean_pages():
            html = path.read_text(encoding='utf-8')
            nav = primary_navigation(html)
            self.assertEqual(nav.count('<a '), 6, path.name)
            for label in expected:
                self.assertIn(f'>{label}</a>', nav, path.name)
            self.assertIn('href="corporate-buildings.html"', nav, path.name)
            self.assertNotIn('>홈</a>', nav, path.name)
            self.assertNotIn('>찾아오는 길</a>', nav, path.name)

    def test_home_prioritizes_live_interest_and_property_search_before_editorial_sections(self):
        home = (REPO / 'index.html').read_text(encoding='utf-8')
        ordered = (
            'id="inquiry-receipts"',
            'id="listings"',
            'lr-home-intro',
            'id="services"',
            'id="official-stats"',
            'id="market-report"',
            'id="contact"',
        )
        positions = [home.index(marker) for marker in ordered]
        self.assertEqual(positions, sorted(positions))
        self.assertIn('어떤 매물을 찾고 계신가요?', home)
        hero = home[home.index('<section class="lr-hero"'):home.index('</section>', home.index('<section class="lr-hero"'))]
        self.assertIn('href="corporate-buildings.html"', hero)
        self.assertIn('기업 사옥·빌딩 보기', hero)
        self.assertNotIn('기업 사옥 350억', hero)
        self.assertNotIn('지금 바로 만날 수 있는 매물들', home)

    def test_listing_cards_and_actions_use_non_overlapping_responsive_layout(self):
        css = (REPO / 'style.css').read_text(encoding='utf-8')
        grid_start = css.index('.lr-listing-grid {')
        grid_end = css.index('}', grid_start)
        grid = css[grid_start:grid_end]
        self.assertIn('repeat(auto-fit, minmax(min(100%, 360px), 1fr))', grid)
        self.assertNotIn('repeat(3,', grid)

        actions_start = css.index('.lr-listing-actions {')
        actions_end = css.index('.lr-mobile-actionbar {', actions_start)
        actions = css[actions_start:actions_end]
        self.assertIn('.lr-listing-actions .lr-btn', actions)
        self.assertIn('box-sizing: border-box;', actions)
        self.assertIn('min-width: 0;', actions)
        self.assertIn('white-space: nowrap;', actions)

    def test_mobile_actionbar_auto_fits_remaining_actions(self):
        css = (REPO / 'style.css').read_text(encoding='utf-8')
        media_start = css.rindex('@media (max-width: 720px)')
        start = css.index('.lr-mobile-actionbar {', media_start)
        end = css.index('}', start)
        block = css[start:end]
        self.assertIn('grid-template-columns: none;', block)
        self.assertIn('grid-auto-flow: column;', block)
        self.assertIn('grid-auto-columns: minmax(0, 1fr);', block)
        widget_css = (REPO / 'css' / 'knowledge-widget.css').read_text(encoding='utf-8')
        widget_start = widget_css.index('.has-knowledge-widget .lr-mobile-actionbar--with-knowledge {')
        widget_end = widget_css.index('}', widget_start)
        widget_block = widget_css[widget_start:widget_end]
        self.assertNotIn('repeat(4, 1fr)', widget_block)
        self.assertIn('grid-auto-columns: minmax(0, 1fr);', widget_block)


if __name__ == '__main__':
    unittest.main()
