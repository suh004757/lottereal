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
    def test_english_home_does_not_present_category_examples_as_live_inventory(self):
        html = (REPO / 'EN.html').read_text(encoding='utf-8')
        self.assertNotIn('Properties available right now', html)
        self.assertNotIn('Featured Listings', html)
        self.assertIn('Property types we can help you find', html)
        self.assertIn('Availability is confirmed before a viewing is arranged.', html)

    def test_english_listings_offer_an_honest_consultation_fallback(self):
        html = (REPO / 'listings-en.html').read_text(encoding='utf-8')
        self.assertIn("Can't find the right match?", html)
        self.assertIn('check current availability before arranging a viewing', html)
        self.assertIn('href="tel:050714025055">Call for current options</a>', html)
        self.assertIn('href="contact_EN.html">Plan a visit</a>', html)

    def test_public_listing_phone_is_always_the_approved_safe_number(self):
        for relative in (
            'js/listingsPage.js',
            'js/listingsPage.en.js',
            'js/listingDetail.js',
            'js/listingDetail.en.js',
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
        self.assertIn('<p class="lr-kicker">추천 매물</p>', home)
        self.assertNotIn('<strong>추천매물</strong>', listings)

    def test_korean_primary_navigation_omits_process_and_english_links(self):
        for path in korean_pages():
            html = path.read_text(encoding='utf-8')
            nav = primary_navigation(html)
            self.assertNotIn('>진행</a>', nav, path.name)
            self.assertNotIn('>ENGLISH</a>', nav, path.name)

        home = (REPO / 'index.html').read_text(encoding='utf-8')
        self.assertIn('<a href="EN.html">ENGLISH</a>', home[home.index('<footer'):])

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
