import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'


class AdminInquiryTableReadabilityTests(unittest.TestCase):
    def test_inquiry_table_has_dedicated_layout_contract(self):
        html = (PUBLIC / 'admin' / 'dashboard.html').read_text(encoding='utf-8')
        self.assertIn('admin-inquiry-table-wrap', html)
        self.assertIn('admin-inquiry-table', html)
        self.assertIn('admin-inquiry-table__col--message', html)
        self.assertIn('admin-inquiry-table__col--status', html)

    def test_inquiry_table_preserves_columns_and_clamps_preview(self):
        css = (PUBLIC / 'css' / 'admin-dashboard.css').read_text(encoding='utf-8')
        self.assertIn('.admin-inquiry-table-wrap', css)
        self.assertIn('overflow-x: auto', css)
        self.assertIn('.admin-inquiry-table {', css)
        self.assertIn('table-layout: fixed', css)
        self.assertIn('min-width: 1040px', css)
        self.assertIn('.admin-inquiry-table__message-preview', css)
        self.assertIn('-webkit-line-clamp: 3', css)
        self.assertIn('font-weight: 500', css)
        self.assertIn('color: #27342f', css)
        self.assertIn('white-space: nowrap', css)

    def test_dashboard_uses_plain_text_summary_in_the_list(self):
        source = (PUBLIC / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn("from './utils/inquiryDisplay.mjs'", source)
        self.assertIn('summarizeInquiryMessage(inq.message)', source)
        self.assertIn("preview.textContent =", source)
        self.assertNotIn('preview.innerHTML', source)
        self.assertIn("preview.className = 'admin-inquiry-table__message-preview'", source)


if __name__ == '__main__':
    unittest.main()
