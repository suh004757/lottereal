import io
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import scripts.lottereal_admin_intake_watch as watcher


class AdminIntakeWatchTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
        self.draft = {
            'id': 'edc64767-1111-4111-8111-111111111111',
            'title': '고객 홍길동 010-1234-5678',
            'summary': '서울 송파구 상세주소 123-45',
            'report_md': '공동현관 비밀번호 1234',
            'evidence_json': [{'private': 'customer@example.com'}],
            'metadata': {
                'intake_source': 'admin-chat',
                'intake_type': 'listing',
                'submitted_by': 'private-user-id',
                'region': '잠실동 상세주소 123-45',
                'transaction_type': '매매 고객 홍길동',
                'image_count': 3,
                'photo_upload_state': 'complete',
            },
        }

    def test_alert_transports_only_fixed_allowlisted_metadata(self):
        alert = watcher.build_alert([self.draft])
        self.assertIn('새 ADMIN 초안 1건', alert)
        self.assertIn('• 매물', alert)
        self.assertIn('사진 3장 · 업로드 완료', alert)
        self.assertIn('접수번호 edc64767', alert)
        for private_value in (
            '서울', '송파구', '잠실동', '123-45', '홍길동', '010-1234-5678',
            'customer@example.com', 'private-user-id', 'report_md', '비밀번호',
        ):
            self.assertNotIn(private_value, alert)

    def test_invalid_ids_are_never_alerted_or_persisted(self):
        malicious = {**self.draft, 'id': '홍길동주소전화번호-010-1234-5678'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            messages = watcher.process_drafts([malicious], path, now=self.now)
            self.assertEqual(messages, [])
            persisted = path.read_text(encoding='utf-8')
            self.assertNotIn('홍길동', persisted)
            self.assertNotIn('010-1234-5678', persisted)

    def test_pending_alert_replays_after_bounded_cooldown_until_resolved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            first = watcher.process_drafts([self.draft], path, now=self.now)
            within = watcher.process_drafts(
                [self.draft], path, now=self.now + timedelta(minutes=5)
            )
            replay = watcher.process_drafts(
                [self.draft], path, now=self.now + watcher.REEMIT_COOLDOWN
            )
            self.assertEqual(len(first), 1)
            self.assertEqual(within, [])
            self.assertEqual(len(replay), 1)
            self.assertIn('새 ADMIN 초안 1건', replay[0])

            state, recovered = watcher.load_state(path)
            self.assertFalse(recovered)
            self.assertIn(self.draft['id'], state['pending'])
            self.assertEqual(state['pending'][self.draft['id']]['emit_count'], 2)

            self.assertEqual(
                watcher.process_drafts([], path, now=self.now + timedelta(hours=2)),
                [],
            )
            state, _ = watcher.load_state(path)
            self.assertEqual(state['pending'], {})

    def test_pending_state_is_durable_before_stdout_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            output = io.StringIO()
            observed = []

            class InspectingStdout:
                def write(self, value):
                    observed.append(json.loads(path.read_text(encoding='utf-8')))
                    return output.write(value)

                def flush(self):
                    return output.flush()

            with (
                mock.patch.dict(os.environ, {'LOTTEREAL_ADMIN_INTAKE_WATCH_STATE': str(path)}),
                mock.patch.object(watcher, 'fetch_admin_intakes', return_value=[self.draft]),
                mock.patch.object(watcher, '_utc_now', return_value=self.now),
                mock.patch('sys.stdout', InspectingStdout()),
            ):
                self.assertEqual(watcher.main(), 0)
            self.assertTrue(observed)
            pending = observed[0]['pending'][self.draft['id']]
            self.assertEqual(pending['emit_count'], 1)
            self.assertEqual(pending['last_emitted_at'], '2026-08-30T12:00:00Z')

    def test_state_contains_only_ids_timestamps_and_bounded_counters(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            watcher.process_drafts([self.draft], path, now=self.now)
            state = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(set(state), {'queue_version', 'pending'})
            pending = state['pending'][self.draft['id']]
            self.assertEqual(
                set(pending),
                {'id', 'discovered_at', 'last_emitted_at', 'emit_count'},
            )
            serialized = json.dumps(state, ensure_ascii=False)
            for private_value in (
                'listing', 'complete', '홍길동', '010-1234-5678', '잠실동',
                'title', 'summary', 'report_md', 'evidence', 'metadata',
            ):
                self.assertNotIn(private_value, serialized)

    def test_corrupt_state_is_quarantined_privately_and_signals_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            path.write_text('{truncated 고객 010-1234-5678', encoding='utf-8')
            os.chmod(path, 0o644)
            messages = watcher.process_drafts([], path, now=self.now)
            self.assertEqual(messages, [watcher.RECOVERY_SIGNAL])
            quarantine = next(Path(directory).glob('state.json.corrupt*'))
            self.assertEqual(quarantine.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), {
                'queue_version': watcher.QUEUE_VERSION,
                'pending': {},
            })

    def test_state_replace_is_0600_and_fsyncs_file_and_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            real_fsync = os.fsync
            calls = []

            def recording_fsync(fd):
                calls.append(fd)
                return real_fsync(fd)

            with mock.patch.object(watcher.os, 'fsync', side_effect=recording_fsync):
                watcher.write_state(path, watcher.empty_state())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertGreaterEqual(len(calls), 2)

    def test_lock_file_is_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            with (
                mock.patch.dict(os.environ, {'LOTTEREAL_ADMIN_INTAKE_WATCH_STATE': str(path)}),
                mock.patch.object(watcher, 'fetch_admin_intakes', return_value=[]),
                mock.patch.object(watcher, '_utc_now', return_value=self.now),
            ):
                self.assertEqual(watcher.main(), 0)
            self.assertEqual(
                path.with_suffix('.json.lock').stat().st_mode & 0o777,
                0o600,
            )

    def test_future_state_version_fails_closed_without_rewrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'state.json'
            original = '{"queue_version": 99, "pending": {"future": "preserve"}}'
            path.write_text(original, encoding='utf-8')
            with self.assertRaises(watcher.UnsupportedQueueVersion):
                watcher.load_state(path)
            self.assertEqual(path.read_text(encoding='utf-8'), original)
            self.assertEqual(list(Path(directory).glob('state.json.corrupt*')), [])

    def test_malformed_image_count_does_not_block_alert_batch(self):
        malformed = {
            **self.draft,
            'metadata': {**self.draft['metadata'], 'image_count': 'bad'},
        }
        second = {
            **self.draft,
            'id': '22222222-2222-4222-8222-222222222222',
        }
        alert = watcher.build_alert([malformed, second])
        self.assertIn('새 ADMIN 초안 2건', alert)
        self.assertIn('사진 0장', alert)
        self.assertIn('접수번호 22222222', alert)

    def test_large_batch_reports_omitted_count(self):
        drafts = [
            {**self.draft, 'id': f'{index:08d}-2222-4222-8222-222222222222'}
            for index in range(5)
        ]
        alert = watcher.build_alert(drafts)
        self.assertIn('새 ADMIN 초안 5건', alert)
        self.assertIn('외 2건', alert)

    def test_runtime_failure_stderr_contains_only_fixed_message(self):
        script = Path(__file__).parents[1] / 'scripts' / 'lottereal_admin_intake_watch.py'
        environment = {
            **os.environ,
            'LOTTEREAL_ADMIN_INTAKE_WATCH_STATE': '/proc/PRIVATE-CUSTOMER-010-9999-8888/state.json',
        }
        result = subprocess.run(
            [sys.executable, str(script)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stderr, 'ADMIN intake watcher failed.\n')
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
