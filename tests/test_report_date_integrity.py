from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ReportDateIntegritySurfaceTest(unittest.TestCase):
    def test_public_adapter_orders_by_original_publication_date(self):
        adapter = (ROOT / 'js/services/reportAdapter.js').read_text(encoding='utf-8')
        self.assertIn(".order('created_at', { ascending: false })", adapter)
        self.assertNotIn(".order('updated_at', { ascending: false })", adapter)
        self.assertIn('compareReportsByPublication', adapter)

    def test_public_report_surfaces_use_shared_date_integrity_helper(self):
        for relative in ('js/homeReportPreview.js', 'js/reportLandingPage.js', 'js/reportPage.js'):
            script = (ROOT / relative).read_text(encoding='utf-8')
            self.assertIn('formatReportDateMeta', script, relative)
            self.assertNotIn('formatDate(report.updated_at)', script, relative)
        report_page = (ROOT / 'js/reportPage.js').read_text(encoding='utf-8')
        landing = (ROOT / 'js/reportLandingPage.js').read_text(encoding='utf-8')
        self.assertIn('compareReportsByPublication', report_page)
        self.assertIn('compareReportsByPublication', landing)

    def test_detail_page_labels_publication_and_revision_honestly(self):
        html = (ROOT / 'report.html').read_text(encoding='utf-8')
        self.assertIn('발행·수정', html)
        self.assertNotIn('<span class="lr-label">최종 업데이트</span>', html)


if __name__ == '__main__':
    unittest.main()
