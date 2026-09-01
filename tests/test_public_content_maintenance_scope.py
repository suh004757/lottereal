import os
import unittest
from unittest.mock import patch

from scripts import maintenance_check
from scripts import post_push_guard


class PublicContentMaintenanceScopeTests(unittest.TestCase):
    def test_public_content_static_allowlists_exclude_private_surfaces(self):
        paths = maintenance_check.PUBLIC_CONTENT_HTML + maintenance_check.PUBLIC_CONTENT_JS
        normalized = '\n'.join(str(path).lower() for path in paths)
        for forbidden in ('/admin/', 'family', 'auth', 'storage', 'inquir'):
            self.assertNotIn(forbidden, normalized)


    @patch('scripts.maintenance_check.subprocess.run')
    def test_default_mode_keeps_full_health_command(self, run):
        run.return_value.returncode = 0
        run.return_value.stdout = '{"market_reports":{"ok":true}}'
        run.return_value.stderr = ''
        with patch.dict(os.environ, {}, clear=True):
            maintenance_check.check_supabase()
        command = run.call_args.args[0]
        self.assertEqual(command[-1], 'health')

    def test_post_push_guard_uses_only_public_content_tests_in_scoped_mode(self):
        with patch.dict(os.environ, {'LOTTEREAL_PUBLIC_CONTENT_ONLY': '1'}):
            commands = post_push_guard.local_verification_commands()
        unittest_command = commands[0][0]
        joined = ' '.join(unittest_command).lower()
        self.assertNotIn('discover', joined)
        for forbidden in ('admin', 'family', 'auth', 'storage', 'inquir'):
            self.assertNotIn(forbidden, joined)
        self.assertEqual(unittest_command[-1], 'tests.test_lease_opposability_current_form_update')

    def test_post_push_guard_preserves_default_verification_commands(self):
        with patch.dict(os.environ, {}, clear=True):
            commands = post_push_guard.local_verification_commands()
        self.assertIn('discover', commands[0][0])
        self.assertIn('scripts/lottereal_supabase.py', commands[1][0])
        self.assertEqual(commands[2][0][-1], 'js/config/appConfig.js')
        self.assertEqual(commands[3][0][-1], 'js/active.js')
        self.assertEqual(commands[4][0][-1], 'scripts/maintenance_check.py')


if __name__ == '__main__':
    unittest.main()
