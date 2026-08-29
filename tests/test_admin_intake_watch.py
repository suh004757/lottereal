import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts.lottereal_admin_intake_watch import (
    build_alert,
    load_seen_ids,
    select_unseen,
    write_seen_ids,
)


class AdminIntakeWatchTest(unittest.TestCase):
    def setUp(self):
        self.draft = {
            'id': 'edc64767-1111-4111-8111-111111111111',
            'report_md': '서울 송파구 잠실동 123-45 홍길동 010-1234-5678',
            'metadata': {
                'intake_source': 'admin-chat',
                'intake_type': 'listing',
                'region': '잠실동 상세주소 123-45',
                'transaction_type': '매매 고객 홍길동',
                'image_count': 3,
                'photo_upload_state': 'complete',
            },
        }

    def test_selects_only_unseen_ids(self):
        second = {**self.draft, 'id': '22222222-2222-4222-8222-222222222222'}
        self.assertEqual(select_unseen([self.draft, second], {self.draft['id']}), [second])
        self.assertEqual(select_unseen([self.draft], {self.draft['id']}), [])

    def test_same_uuid_is_deduplicated_within_one_batch(self):
        uppercase = {**self.draft, 'id': self.draft['id'].upper()}
        self.assertEqual(select_unseen([self.draft, uppercase], set()), [self.draft])

    def test_invalid_ids_are_never_transported_or_persisted(self):
        malicious = {**self.draft, 'id': '홍길동주소전화번호-010-1234-5678'}
        self.assertEqual(select_unseen([malicious], set()), [])
        alert = build_alert([malicious])
        self.assertIn('접수번호 확인불가', alert)
        self.assertNotIn('홍길동', alert)
        self.assertNotIn('010-1234-5678', alert)

    def test_exception_handler_uses_a_fixed_message(self):
        source = (Path(__file__).parents[1] / 'scripts' / 'lottereal_admin_intake_watch.py').read_text(encoding='utf-8')
        self.assertIn("print('ADMIN intake watcher failed.', file=sys.stderr)", source)
        self.assertNotIn("failed: {error}", source)

    def test_runtime_failure_stderr_contains_only_fixed_message(self):
        script = Path(__file__).parents[1] / 'scripts' / 'lottereal_admin_intake_watch.py'
        environment = {**os.environ, 'LOTTEREAL_ADMIN_INTAKE_WATCH_STATE': '/proc/PRIVATE-CUSTOMER-010-9999-8888/state.json'}
        result = subprocess.run(
            [sys.executable, str(script)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stderr, 'ADMIN intake watcher failed.\n')

    def test_alert_transports_no_freeform_or_personal_fields(self):
        alert = build_alert([self.draft])
        self.assertIn('새 ADMIN 초안 1건', alert)
        self.assertIn('• 매물', alert)
        self.assertIn('사진 3장 · 업로드 완료', alert)
        self.assertIn('접수번호 edc64767', alert)
        for private_value in ('서울', '송파구', '잠실동', '123-45', '홍길동', '010-1234-5678', 'report_md'):
            self.assertNotIn(private_value, alert)

    def test_seen_state_round_trip_is_local_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'seen.json'
            write_seen_ids(path, {'b', 'a'})
            self.assertEqual(load_seen_ids(path), {'a', 'b'})
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), {'seen_ids': ['a', 'b']})

    def test_corrupt_state_is_quarantined_and_recovers_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'seen.json'
            path.write_text('{truncated', encoding='utf-8')
            self.assertEqual(load_seen_ids(path), set())
            self.assertFalse(path.exists())
            self.assertEqual(len(list(Path(directory).glob('seen.json.corrupt*'))), 1)

    def test_malformed_image_count_does_not_block_alert_batch(self):
        malformed = {**self.draft, 'metadata': {**self.draft['metadata'], 'image_count': 'bad'}}
        second = {**self.draft, 'id': '22222222-2222-4222-8222-222222222222'}
        alert = build_alert([malformed, second])
        self.assertIn('새 ADMIN 초안 2건', alert)
        self.assertIn('사진 0장', alert)
        self.assertIn('접수번호 22222222', alert)

    def test_large_batch_reports_omitted_count(self):
        drafts = [{**self.draft, 'id': f'{index:08d}-2222-4222-8222-222222222222'} for index in range(5)]
        alert = build_alert(drafts)
        self.assertIn('새 ADMIN 초안 5건', alert)
        self.assertIn('외 2건', alert)


if __name__ == '__main__':
    unittest.main()
