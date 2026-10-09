import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'


class AdminInquiryDetailAndStatusTests(unittest.TestCase):
    def test_detail_message_uses_readable_light_theme_typography(self):
        css = (PUBLIC / 'css' / 'admin-dashboard.css').read_text(encoding='utf-8')
        self.assertIn('.admin-inquiry-message {', css)
        self.assertIn('color: #27342f', css)
        self.assertIn('font-size: 15px', css)
        self.assertIn('font-weight: 500', css)
        self.assertIn('line-height: 1.75', css)
        self.assertNotIn('color: #e2e8f0', css)
        self.assertIn('#inquiryActionStatus.admin-message[data-status="error"]', css)

    def test_dashboard_refreshes_auth_before_admin_operations(self):
        auth = (PUBLIC / 'js' / 'services' / 'authService.js').read_text(encoding='utf-8')
        dashboard = (PUBLIC / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn('export async function refreshAdminSession()', auth)
        self.assertIn('client.auth.refreshSession()', auth)
        self.assertIn('refreshAdminSession', dashboard)
        self.assertIn('await refreshAdminSession();', dashboard)

    def test_status_update_surfaces_failure_and_does_not_silently_reload(self):
        html = (PUBLIC / 'admin' / 'dashboard.html').read_text(encoding='utf-8')
        dashboard = (PUBLIC / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        backend = (PUBLIC / 'js' / 'services' / 'backendAdapter.js').read_text(encoding='utf-8')
        self.assertIn('id="inquiryActionStatus"', html)
        self.assertIn('setInquiryActionStatus', dashboard)
        self.assertIn('문의 상태를 변경하지 못했습니다.', dashboard)
        self.assertIn('if (!updated) throw new Error', dashboard)
        self.assertIn('inquiryStatusUpdateInFlight', dashboard)
        self.assertIn("querySelectorAll('[data-inquiry]')", dashboard)
        self.assertIn("throw error;", backend)


if __name__ == '__main__':
    unittest.main()
