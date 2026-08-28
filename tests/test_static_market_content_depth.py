import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in {'script', 'style'} and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def visible_text(name):
    parser = TextExtractor()
    parser.feed((ROOT / name).read_text(encoding='utf-8'))
    return ' '.join(' '.join(parser.parts).split())


class StaticMarketContentDepthTests(unittest.TestCase):
    def test_historical_market_pages_explain_local_decisions_in_depth(self):
        overview = visible_text('insights.html')
        detail = visible_text('insight-detail.html')

        self.assertGreaterEqual(len(overview), 1800)
        self.assertGreaterEqual(len(detail), 2500)

        for marker in ('누구에게 어떤 의미였나요?', '당시 선택지를 비교하는 순서', '상담 전에 준비할 정보'):
            self.assertIn(marker, overview)

        for marker in ('평균과 개별 단지 사이의 전달 경로', '실거래를 확인하는 순서', '매수·전세·갈아타기별 확인점', '상담 전에 준비할 정보'):
            self.assertIn(marker, detail)


if __name__ == '__main__':
    unittest.main()
