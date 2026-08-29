from pathlib import Path
import unittest


class ExternalInquiryReceiptMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = (
            Path(__file__).parents[1]
            / 'supabase'
            / 'migrations'
            / '011_public_external_inquiry_receipts.sql'
        ).read_text(encoding='utf-8').lower()

    def test_public_grant_contains_only_safe_columns(self):
        self.assertIn(
            'grant select (source, listing_number, received_hour, status, expires_at)',
            self.sql,
        )
        grant_section = self.sql.split('grant select', 1)[1].split(';', 1)[0]
        self.assertNotIn('source_message_hash', grant_section)
        self.assertNotIn('created_at', grant_section)
        self.assertNotIn('id', grant_section)

    def test_public_rows_are_hour_bucketed_and_expire_after_24_hours(self):
        self.assertIn("extract(minute from received_hour) = 0", self.sql)
        self.assertIn("expires_at timestamptz not null default (now() + interval '24 hours')", self.sql)
        self.assertIn("received_hour <= created_at + interval '5 minutes'", self.sql)
        self.assertIn("received_hour >= created_at - interval '30 days'", self.sql)
        self.assertIn('expires_at > now()', self.sql)
        self.assertIn("expires_at <= created_at + interval '24 hours'", self.sql)

    def test_public_roles_have_no_write_grant(self):
        self.assertIn(
            'revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public',
            self.sql,
        )
        self.assertNotIn('grant insert', self.sql)
        self.assertNotIn('grant update', self.sql)
        self.assertNotIn('grant delete', self.sql)


if __name__ == '__main__':
    unittest.main()
