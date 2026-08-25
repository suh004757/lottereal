import os
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))

from lottereal_inquiry_watch import format_message, configured_mention


class InquiryWatchTest(unittest.TestCase):
    def test_alert_mentions_james_and_masks_customer_phone(self):
        message = format_message([{
            'created_at': '2026-08-25T06:00:00Z',
            'listing_title': '직방 매물 12345678',
            'name': '고객',
            'phone': '01012345678',
            'message': '희망 연락시간: 오늘 오후',
        }], mention='<@123456789012345678>')

        self.assertTrue(message.startswith('<@123456789012345678> 롯데부동산 새 문의'))
        self.assertIn('***-****-5678', message)
        self.assertNotIn('01012345678', message)
        self.assertIn('직방 매물 12345678', message)

    def test_mention_can_be_loaded_from_private_env_values(self):
        self.assertEqual(
            configured_mention({'LOTTEREAL_INQUIRY_MENTION': '<@123456789012345678>'}),
            '<@123456789012345678>',
        )


if __name__ == '__main__':
    unittest.main()