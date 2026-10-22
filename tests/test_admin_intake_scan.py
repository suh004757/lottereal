from pathlib import Path
import sys
import unittest
from unittest import mock
from urllib.parse import parse_qs

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / 'scripts'
sys.path.insert(0, str(SCRIPTS))

import lottereal_admin_intake_scan as scanner
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

    def test_scan_payload_returns_only_bounded_allowlisted_metadata(self):
        item = {
            'id': '12345678-abcd-4abc-8def-123456789abc',
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
        self.assertEqual(payload, {
            'draft_count': 1,
            'drafts': [{
                'id': '12345678-abcd-4abc-8def-123456789abc',
                'intake_type': 'listing',
                'image_count': 0,
                'photo_upload_state': 'unknown',
            }],
        })
        serialized = str(payload)
        for private_value in (
            item['title'], item['summary'], item['report_md'], 'private-user-id',
            '010-1234-5678', '101동', '1203호', 'access_code',
        ):
            self.assertNotIn(private_value, serialized)

    def test_fetch_projects_no_free_text_or_evidence_columns(self):
        queries = []

        def request(_method, _table, _env, *, query):
            queries.append(parse_qs(query.removeprefix('?')))
            return 200, []

        with (
            mock.patch.object(scanner, 'load_env', return_value={}),
            mock.patch.object(scanner, 'supabase_request', side_effect=request),
        ):
            self.assertEqual(scanner.fetch_admin_intakes(), [])

        self.assertEqual(len(queries), 1)
        selected = queries[0]['select'][0].split(',')
        self.assertEqual(selected, ['id', 'status', 'metadata'])
        for forbidden in ('slug', 'title', 'summary', 'report_md', 'evidence_json'):
            self.assertNotIn(forbidden, selected)

    def test_non_uuid_identifier_cannot_escape_as_metadata(self):
        item = {
            'id': 'customer-홍길동-010-1234-5678',
            'status': 'draft',
            'metadata': {'intake_source': 'admin-chat', 'intake_type': 'listing'},
        }
        payload = build_scan_payload([item])
        self.assertEqual(payload, {'draft_count': 0, 'drafts': []})
        self.assertNotIn('홍길동', str(payload))

    def test_scan_has_no_discord_delivery_or_seen_state(self):
        source = (SCRIPTS / 'lottereal_admin_intake_scan.py').read_text(encoding='utf-8')
        self.assertNotIn('DISCORD_', source)
        self.assertNotIn('discord.com/api', source)
        self.assertNotIn('seen_ids', source)
        self.assertNotIn('STATE_PATH', source)
        self.assertIn("'offset'", source)


if __name__ == '__main__':
    unittest.main()
