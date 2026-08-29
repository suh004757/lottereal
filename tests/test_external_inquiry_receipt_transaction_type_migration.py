from pathlib import Path
import unittest


class ExternalInquiryReceiptTransactionTypeMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = (
            Path(__file__).parents[1]
            / 'supabase'
            / 'migrations'
            / '012_external_inquiry_receipt_transaction_type.sql'
        ).read_text(encoding='utf-8').lower()

    def test_transaction_type_is_strict_and_publicly_readable(self):
        self.assertIn('transaction_type text', self.sql)
        self.assertIn("transaction_type in ('전세', '월세', '매매')", self.sql)
        self.assertIn(
            'grant select (source, listing_number, transaction_type, received_hour, status, expires_at)',
            self.sql,
        )

    def test_private_and_write_columns_remain_unavailable(self):
        grant = self.sql.rsplit('grant select', 1)[1].split(';', 1)[0]
        self.assertNotIn('source_message_hash', grant)
        self.assertNotIn('created_at', grant)
        self.assertNotIn('id', grant)
        self.assertIn(
            'revoke all privileges on table public.external_inquiry_receipts from anon, authenticated, public',
            self.sql,
        )
        self.assertNotIn('grant insert', self.sql)
        self.assertNotIn('grant update', self.sql)
        self.assertNotIn('grant delete', self.sql)

    def test_legacy_rows_are_preserved_during_compatible_rollout(self):
        self.assertNotIn('delete from public.external_inquiry_receipts', self.sql)
        self.assertNotIn('alter column transaction_type set not null', self.sql)
        self.assertIn('legacy receipts can remain untyped', self.sql)


if __name__ == '__main__':
    unittest.main()
