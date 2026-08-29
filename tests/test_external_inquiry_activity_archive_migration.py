from pathlib import Path
import unittest


class ExternalInquiryActivityArchiveMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).parents[1] / 'supabase' / 'migrations'
        cls.add_rpc = (root / '013_external_inquiry_activity_archive_rpc.sql').read_text(encoding='utf-8').lower()
        cls.lock_down = (root / '014_external_inquiry_activity_revoke_base_select.sql').read_text(encoding='utf-8').lower()

    def test_archive_rpc_exposes_one_year_activity_and_fixed_summary(self):
        sql = self.add_rpc
        self.assertIn('get_external_inquiry_activity()', sql)
        self.assertIn("interval '365 days'", sql)
        self.assertIn("interval '24 hours'", sql)
        self.assertIn("'total'", sql)
        self.assertIn("'jeonse'", sql)
        self.assertIn("'monthly_rent'", sql)
        self.assertIn("'sale'", sql)
        self.assertIn('limit 12', sql)
        self.assertIn("'current'", sql)
        self.assertIn("'history'", sql)

    def test_archive_rpc_minimizes_old_timestamps_and_private_fields(self):
        sql = self.add_rpc
        self.assertIn("to_char(received_hour at time zone 'asia/seoul', 'yyyy-mm-dd')", sql)
        self.assertIn('security definer', sql)
        self.assertIn('set search_path = pg_catalog, public', sql)
        self.assertIn('revoke all on function public.get_external_inquiry_activity() from public', sql)
        self.assertIn('grant execute on function public.get_external_inquiry_activity() to anon, authenticated', sql)
        function_body = sql.split('create or replace function', 1)[1]
        for private_field in ('customer_name', 'phone', 'email', 'address', 'price', 'message_id', 'gmail_uid'):
            self.assertNotIn(private_field, function_body)

    def test_rollout_keeps_old_reader_compatible_until_frontend_is_live(self):
        policy_sql = self.add_rpc.split('create or replace function', 1)[0]
        self.assertIn('expires_at > now()', policy_sql)
        self.assertIn("received_hour >= now() - interval '24 hours'", policy_sql)
        self.assertNotIn("received_hour >= now() - interval '365 days'", policy_sql)
        self.assertNotIn('revoke select', self.add_rpc)
        self.assertIn('revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public', self.lock_down)
        self.assertIn('grant execute on function public.get_external_inquiry_activity() to anon, authenticated', self.lock_down)
        self.assertNotIn('grant select', self.lock_down)


if __name__ == '__main__':
    unittest.main()
