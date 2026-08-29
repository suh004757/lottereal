from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class AdminIntakeUiTest(unittest.TestCase):
    def test_chat_first_admin_has_two_large_intent_choices_and_no_publish_action(self):
        html = (REPO / 'admin' / 'intake.html').read_text(encoding='utf-8')
        self.assertIn('id="intakeListingBtn"', html)
        self.assertIn('id="intakeReportBtn"', html)
        self.assertIn('id="intakeMessage"', html)
        self.assertIn('id="saveIntakeBtn"', html)
        self.assertNotIn('id="publishIntakeBtn"', html)
        self.assertIn('자동으로 공개되지 않습니다', html)

    def test_chat_first_admin_uses_accessible_mobile_sizing(self):
        css = (REPO / 'css' / 'admin-intake.css').read_text(encoding='utf-8')
        self.assertIn('font-size: 18px', css)
        self.assertIn('min-height: 52px', css)
        self.assertIn('@media (max-width: 720px)', css)
        self.assertIn('[hidden] { display: none !important; }', css)

    def test_dashboard_links_to_chat_first_intake_as_primary_action(self):
        html = (REPO / 'admin' / 'dashboard.html').read_text(encoding='utf-8')
        self.assertIn('href="intake.html"', html)
        self.assertIn('채팅으로 초안 만들기', html)
        source = (REPO / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn("const section = item.getAttribute('data-section');", source)
        self.assertIn('if (!section) return;', source)

    def test_intake_save_path_is_supabase_only_and_draft_only(self):
        page = (REPO / 'js' / 'admin-intake-page.js').read_text(encoding='utf-8')
        adapter = (REPO / 'js' / 'services' / 'adminIntakeAdapter.js').read_text(encoding='utf-8')
        self.assertIn("from './services/adminIntakeAdapter.js'", page)
        self.assertNotIn('saveReport', page)
        self.assertIn("payload.status !== 'draft'", adapter)
        self.assertIn("payload.metadata?.intake_source !== 'admin-chat'", adapter)
        self.assertIn('payload.metadata?.publish_approved !== false', adapter)
        self.assertIn('if (!supabase)', adapter)
        self.assertNotIn('saveReportMock', adapter)


if __name__ == '__main__':
    unittest.main()
