import hashlib
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENV_PATH = Path('/opt/data/.env')


def load_env():
    values = {}
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key] = value.strip().strip('"').strip("'")
    return values


def contains_secret(text, value):
    return bool(value) and value in text


def fingerprint(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]


class FrontendSupabaseConfigTest(unittest.TestCase):
    def setUp(self):
        if not ENV_PATH.exists():
            self.skipTest('local Supabase env file is not available')
        env = load_env()
        required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY']
        missing = [key for key in required if not env.get(key)]
        if missing:
            self.skipTest('local Supabase env values are not fully configured')

    def test_static_frontend_uses_current_anon_key_not_rotated_publishable_or_secret(self):
        """Static hosting has no Vite env injection; fallback key must be current anon JWT."""
        env = load_env()
        app_config = (REPO / 'js/config/appConfig.js').read_text(encoding='utf-8')

        self.assertTrue(contains_secret(app_config, env['SUPABASE_URL']), 'current Supabase URL missing from appConfig')
        self.assertTrue(
            contains_secret(app_config, env['SUPABASE_ANON_KEY']),
            'current Supabase anon key missing from appConfig fingerprint=' + fingerprint(env['SUPABASE_ANON_KEY'])
        )
        self.assertFalse(contains_secret(app_config, env['SUPABASE_SECRET_KEY']), 'service/secret key leaked into appConfig')
        self.assertFalse(contains_secret(app_config, env['SUPABASE_PUBLISHABLE_KEY']), 'rotated publishable key still hard-coded in appConfig')

    def test_local_env_uses_anon_key_for_browser_equivalent_behavior(self):
        env = load_env()
        local_env = (REPO / '.env.local').read_text(encoding='utf-8')

        self.assertTrue(contains_secret(local_env, env['SUPABASE_URL']), 'current Supabase URL missing from .env.local')
        self.assertTrue(
            contains_secret(local_env, env['SUPABASE_ANON_KEY']),
            'current Supabase anon key missing from .env.local fingerprint=' + fingerprint(env['SUPABASE_ANON_KEY'])
        )
        self.assertFalse(contains_secret(local_env, env['SUPABASE_SECRET_KEY']), 'service/secret key leaked into .env.local')
        self.assertFalse(contains_secret(local_env, env['SUPABASE_PUBLISHABLE_KEY']), 'rotated publishable key still present in .env.local')


if __name__ == '__main__':
    unittest.main()
