from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]


class AdminAuthGuardTest(unittest.TestCase):
    def test_login_redirects_admin_to_chat_intake_and_rejects_non_admin(self):
        source = (REPO / 'js' / 'admin-login.js').read_text(encoding='utf-8')
        self.assertIn("app_metadata?.role === 'admin'", source)
        self.assertIn("./intake.html", source)
        self.assertNotIn("window.location.href = './dashboard.html'", source)

    def test_google_only_login_is_minimal_and_keeps_runtime_admin_guard(self):
        html = (REPO / 'admin' / 'login.html').read_text(encoding='utf-8')
        login = (REPO / 'js' / 'admin-login.js').read_text(encoding='utf-8')
        auth = (REPO / 'js' / 'services' / 'authService.js').read_text(encoding='utf-8')
        css_path = REPO / 'css' / 'admin-login.css'
        self.assertTrue(css_path.exists(), 'Google-only login stylesheet is missing')
        css = css_path.read_text(encoding='utf-8')

        self.assertIn('id="googleLoginButton"', html)
        button = html.split('id="googleLoginButton"', 1)[1].split('>', 1)[0]
        self.assertNotIn('hidden', button)
        self.assertIn('disabled', button)
        self.assertIn('Google 계정으로 계속', html)
        self.assertIn('허용된 관리자 계정만 관리 화면에 접근할 수 있습니다.', html)
        self.assertIn('href="../index.html"', html)
        self.assertIn('../css/admin-login.css', html)

        for forbidden in (
            'id="adminLoginForm"',
            'type="email"',
            'type="password"',
            'googleLoginDivider',
            'geoButton',
            'logoutButton',
            'sessionStatus',
            'admin-checklist',
        ):
            self.assertNotIn(forbidden, html)
        for forbidden in ('signInAdmin,', 'new FormData', 'navigator.geolocation', 'setInterval'):
            self.assertNotIn(forbidden, login)

        self.assertIn('isGoogleSignInAvailable', login)
        self.assertIn('signInAdminWithGoogle', login)
        self.assertIn("provider: 'google'", auth)
        self.assertIn("new URL('./login.html', window.location.href).href", auth)
        self.assertIn("'/auth/v1/settings'", auth)
        self.assertIn("app_metadata?.role === 'admin'", login)
        self.assertIn('min-height: 56px', css)
        self.assertIn('max-width: 460px', css)

    def test_intake_page_checks_server_managed_admin_role(self):
        source = (REPO / 'js' / 'admin-intake-page.js').read_text(encoding='utf-8')
        self.assertIn("user.app_metadata?.role !== 'admin'", source)
        self.assertIn("signOutAdmin", source)

    def test_advanced_dashboard_rejects_authenticated_non_admin(self):
        source = (REPO / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertIn("currentAdmin.app_metadata?.role !== 'admin'", source)
        self.assertIn('await signOutAdmin()', source)

    def test_advanced_dashboard_does_not_interpolate_database_values_into_html(self):
        source = (REPO / 'js' / 'admin-dashboard.js').read_text(encoding='utf-8')
        self.assertNotIn('tr.innerHTML = `', source)
        self.assertNotIn('inquiryFields.status.innerHTML', source)
        self.assertIn('.textContent =', source)

    def test_admin_preview_pins_a_patched_dompurify_with_sri(self):
        for relative in ('admin/dashboard.html', 'admin/report-editor.html'):
            html = (REPO / relative).read_text(encoding='utf-8')
            self.assertIn('dompurify@3.4.14/dist/purify.min.js', html)
            self.assertIn('integrity="sha384-', html)
            self.assertIn('crossorigin="anonymous"', html)
            self.assertNotIn('dompurify@3.0.6', html)

    def test_database_policies_require_admin_and_keep_admin_chat_private(self):
        migration = (REPO / 'supabase' / 'migrations' / '007_secure_admin_operations_rls.sql').read_text(encoding='utf-8')
        self.assertGreaterEqual(migration.count("auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'"), 8)
        self.assertIn("metadata ->> 'intake_source' is distinct from 'admin-chat'", migration)
        self.assertIn("status = 'draft'", migration)
        self.assertIn("metadata ->> 'publish_approved'", migration)
        self.assertIn('market_reports_public_published_select', migration)
        self.assertIn('property_listings_public_select', migration)
        self.assertIn('inquiries_public_insert', migration)
        self.assertNotIn('grant insert on table public.property_listings to anon', migration.lower())

        lock_migration = (REPO / 'supabase' / 'migrations' / '008_lock_admin_intake_provenance.sql').read_text(encoding='utf-8')
        self.assertIn("old.metadata ->> 'intake_source' = 'admin-chat'", lock_migration.lower())
        self.assertIn("new.metadata ->> 'intake_source' is distinct from 'admin-chat'", lock_migration.lower())
        self.assertIn("new.status is distinct from 'draft'", lock_migration.lower())
        self.assertIn("raise exception", lock_migration.lower())


if __name__ == '__main__':
    unittest.main()
