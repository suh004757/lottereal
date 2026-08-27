import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY_PAGES = ('insights.html', 'insight-detail.html')
UNSOURCED_MARKERS = (
    '최종 업데이트: 최신',
    '최신 업데이트',
    'MOCK_INSIGHTS',
    '+2.3%',
    '-4.7%',
)


class LegacyInsightsRetirementTest(unittest.TestCase):
    def test_legacy_market_pages_send_visitors_to_sourced_reports(self):
        for filename in LEGACY_PAGES:
            html = (ROOT / filename).read_text(encoding='utf-8')
            with self.subTest(filename=filename):
                self.assertRegex(
                    html,
                    re.compile(r'<meta\s+http-equiv="refresh"\s+content="0;\s*url=report\.html"', re.I),
                )
                self.assertIn('<link rel="canonical" href="https://lottes.co.kr/report.html">', html)
                self.assertIn('href="report.html"', html)
                self.assertIn('공식 출처와 기준일을 확인한 시장·정책 자료', html)

    def test_legacy_market_pages_no_longer_publish_unsourced_metrics(self):
        combined = '\n'.join(
            (ROOT / filename).read_text(encoding='utf-8') for filename in LEGACY_PAGES
        )
        for marker in UNSOURCED_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, combined)

        controller = (ROOT / 'js' / 'insightsPage.js').read_text(encoding='utf-8')
        self.assertNotIn('MOCK_INSIGHTS', controller)
        self.assertNotIn('Mock Data Version', controller)

    def test_retired_routes_are_not_promoted_by_sitemap_or_internal_links(self):
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        self.assertNotIn('/insights.html', sitemap)
        self.assertNotIn('/insight-detail.html', sitemap)

        internal_links = []
        for path in ROOT.glob('*.html'):
            if path.name in LEGACY_PAGES:
                continue
            html = path.read_text(encoding='utf-8')
            if re.search(r'href="(?:insights|insight-detail)\.html', html):
                internal_links.append(path.name)
        self.assertEqual(internal_links, [])


if __name__ == '__main__':
    unittest.main()
