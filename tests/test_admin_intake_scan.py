from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / 'scripts'
sys.path.insert(0, str(SCRIPTS))

from lottereal_admin_intake_scan import build_scan_payload, is_admin_chat_intake


class AdminIntakeScanTest(unittest.TestCase):
    def test_only_private_admin_chat_drafts_are_scanned(self):
        self.assertTrue(is_admin_chat_intake({
            'status': 'draft',
            'metadata': {'intake_source': 'admin-chat'}
        }))
        self.assertFalse(is_admin_chat_intake({
            'status': 'published',
            'metadata': {'intake_source': 'admin-chat'}
        }))
        self.assertFalse(is_admin_chat_intake({
            'status': 'draft',
            'metadata': {'intake_source': 'other'}
        }))

    def test_scan_payload_returns_full_private_draft_for_owner_review(self):
        item = {
            'id': '12345678-abcd-efgh',
            'slug': 'admin-intake-listing-12345678',
            'created_at': '2026-08-29T01:00:00Z',
            'updated_at': '2026-08-29T01:00:01Z',
            'status': 'draft',
            'title': '[검토 대기] 매물 초안 · 010-1234-5678',
            'summary': '101동 1203호 비밀번호 1234',
            'report_md': '고객 원문과 상세주소',
            'evidence_json': [],
            'metadata': {
                'intake_source': 'admin-chat',
                'intake_type': 'listing',
                'submitted_by': 'private-user-id',
                'region': '010-1234-5678 101동 1203호',
                'sensitive_flags': ['unit_number', 'access_code', 'phone']
            }
        }
        payload = build_scan_payload([item])
        self.assertEqual(payload['draft_count'], 1)
        draft = payload['drafts'][0]
        self.assertEqual(draft['id'], item['id'])
        self.assertEqual(draft['title'], item['title'])
        self.assertEqual(draft['summary'], item['summary'])
        self.assertEqual(draft['report_md'], item['report_md'])
        self.assertEqual(draft['metadata'], item['metadata'])
        self.assertEqual(draft['status'], 'draft')

    def test_scan_has_no_discord_delivery_or_seen_state(self):
        source = (SCRIPTS / 'lottereal_admin_intake_scan.py').read_text(encoding='utf-8')
        self.assertNotIn('DISCORD_', source)
        self.assertNotIn('discord.com/api', source)
        self.assertNotIn('seen_ids', source)
        self.assertNotIn('STATE_PATH', source)
        self.assertIn("'offset'", source)


if __name__ == '__main__':
    unittest.main()
