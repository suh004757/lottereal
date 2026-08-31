from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InquiryRetentionTest(unittest.TestCase):
    def test_policy_uses_a_measurable_collection_based_retention_period(self):
        ko = (ROOT / 'privacy.html').read_text(encoding='utf-8')
        english = (ROOT / 'EN.html').read_text(encoding='utf-8')
        japanese = (ROOT / 'JP.html').read_text(encoding='utf-8')
        self.assertIn('수집일로부터 1년', ko)
        self.assertNotIn('상담 완료 후 1년', ko)
        for guide in (english, japanese):
            self.assertIn('href="privacy.html"', guide)
            self.assertNotIn('<form', guide)

    def test_purge_script_deletes_only_inquiries_older_than_one_year(self):
        script = (ROOT / 'scripts/purge_expired_inquiries.py').read_text(encoding='utf-8')
        self.assertIn('supabase_request(', script)
        self.assertIn("'DELETE', 'inquiries'", script)
        self.assertIn("safe=':-T'", script)
        self.assertIn("?created_at=lt.", script)
        self.assertIn('one_year_ago', script)
        self.assertIn('select=id', script)
        self.assertNotIn('print(', script)
        self.assertNotIn('phone', script)
        self.assertNotIn('message', script)


if __name__ == '__main__':
    unittest.main()
