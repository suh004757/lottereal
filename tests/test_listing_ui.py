from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]
NAV_PAGES = ('index.html', 'listings.html', 'insights.html', 'insight-detail.html', 'report.html')


class ListingUiTest(unittest.TestCase):
    def test_recommended_listing_navigation_link_is_removed_but_home_content_stays(self):
        for name in NAV_PAGES:
            html = (REPO / name).read_text(encoding='utf-8')
            self.assertNotIn('>추천매물</a>', html, name)
        home = (REPO / 'index.html').read_text(encoding='utf-8')
        listings = (REPO / 'listings.html').read_text(encoding='utf-8')
        self.assertIn('<p class="lr-kicker">추천 매물</p>', home)
        self.assertNotIn('<strong>추천매물</strong>', listings)

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
