import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'js' / 'config' / 'reportLandingConfig.js'


class ReportLandingContentDepthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = CONFIG.read_text(encoding='utf-8')

    def config_block(self, key, next_key):
        end = r"\n  \}\s*\n\};" if next_key == '__end__' else rf"\n  {next_key}: \{{"
        pattern = rf"  {key}: \{{(?P<body>.*?){end}"
        match = re.search(pattern, self.text, re.DOTALL)
        if match is None:
            self.fail(key)
        return match.group('body')

    def test_market_hubs_explain_decision_process_not_only_generic_market_copy(self):
        blocks = {
            'songpaMarket': self.config_block('songpaMarket', 'jamsilMarket'),
            'jamsilMarket': self.config_block('jamsilMarket', 'gangnamOffice'),
            'gangnamOffice': self.config_block('gangnamOffice', '__end__'),
        }

        for key, block in blocks.items():
            self.assertGreaterEqual(block.count('heading:'), 3, key)
            self.assertGreaterEqual(block.count('question:'), 4, key)
            self.assertGreaterEqual(len(block), 1800, key)

        self.assertIn('같은 단지·면적의 신고 거래', blocks['songpaMarket'])
        self.assertIn('계약 해제 여부', blocks['jamsilMarket'])
        self.assertIn('총점유비용', blocks['gangnamOffice'])
        self.assertIn('원상복구', blocks['gangnamOffice'])


if __name__ == '__main__':
    unittest.main()
