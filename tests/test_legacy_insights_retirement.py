import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY_PAGES = ('insights.html', 'insight-detail.html')


class HistoricalInsightsPreservationTest(unittest.TestCase):
    def test_historical_market_pages_preserve_their_urls_and_as_of_date(self):
        expected_canonicals = {
            'insights.html': 'https://lottes.co.kr/insights.html',
            'insight-detail.html': 'https://lottes.co.kr/insight-detail.html',
        }
        for filename, canonical in expected_canonicals.items():
            html = (ROOT / filename).read_text(encoding='utf-8')
            with self.subTest(filename=filename):
                self.assertNotRegex(html, re.compile(r'http-equiv="refresh"', re.I))
                self.assertNotIn('noindex', html.lower())
                self.assertIn(f'<link rel="canonical" href="{canonical}">', html)
                self.assertIn('자료 기준일: 2026년 3월 2일', html)
                self.assertIn('작성일: 2026년 3월 7일', html)
                self.assertIn('한국부동산원', html)
                self.assertIn('서울시 부동산 실거래가 정보', html)

    def test_historical_market_pages_publish_only_verified_snapshot_metrics(self):
        combined = '\n'.join(
            (ROOT / filename).read_text(encoding='utf-8') for filename in LEGACY_PAGES
        )
        for marker in ('최종 업데이트: 최신', '최신 업데이트', '+2.3%', '-4.7%', '+1.8%', '-3.2%'):
            with self.subTest(marker=marker):
                self.assertNotIn(marker, combined)

        for verified_marker in ('전국 0.04%', '서울 0.09%', '송파구 -0.09%', '서울 전세 0.08%'):
            with self.subTest(verified_marker=verified_marker):
                self.assertIn(verified_marker, combined)

        controller = (ROOT / 'js' / 'insightsPage.js').read_text(encoding='utf-8')
        self.assertNotIn('MOCK_INSIGHTS', controller)
        self.assertNotIn('Mock Data Version', controller)

    def test_historical_routes_remain_in_sitemap_and_internal_links(self):
        sitemap = (ROOT / 'Sitemap.xml').read_text(encoding='utf-8')
        self.assertIn('https://lottes.co.kr/insights.html', sitemap)
        self.assertIn('https://lottes.co.kr/insight-detail.html', sitemap)

        internal_links = 0
        for path in ROOT.glob('*.html'):
            if path.name in LEGACY_PAGES:
                continue
            html = path.read_text(encoding='utf-8')
            if re.search(r'href="(?:insights|insight-detail)\.html', html):
                internal_links += 1
        self.assertGreaterEqual(internal_links, 4)


if __name__ == '__main__':
    unittest.main()
