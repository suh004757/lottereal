from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import tempfile
import unittest


class InquiryAnomalyWatchTest(unittest.TestCase):
    def test_fresh_heartbeat_initializes_silently(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_success_at': (now - timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')

            self.assertEqual(run_once(heartbeat_path, state_path, now=now), '')
            self.assertEqual(
                json.loads(state_path.read_text(encoding='utf-8')),
                {'stale_alerted': False},
            )
            self.assertEqual(state_path.stat().st_mode & 0o777, 0o600)
    def test_stale_heartbeat_alerts_once_without_private_data(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_success_at': (now - timedelta(minutes=8)).isoformat().replace('+00:00', 'Z'),
                'customer_phone': '010-1234-5678',
                'token': 'private-token',
            }), encoding='utf-8')

            first = run_once(heartbeat_path, state_path, now=now)
            second = run_once(heartbeat_path, state_path, now=now + timedelta(minutes=1))
            self.assertEqual(first, (
                '⚠️ LotteReal 문의 알림 점검 필요\n'
                '유형: Gmail watcher 실행 지연\n'
                '마지막 실행 시도: 7분 이상 전\n'
                '고객정보·메일 본문·직방 링크는 포함하지 않았습니다.'
            ))
            self.assertEqual(second, '')
            self.assertNotIn('010-1234-5678', first)
            self.assertNotIn('private-token', first)
            self.assertEqual(
                json.loads(state_path.read_text(encoding='utf-8')),
                {'stale_alerted': True},
            )
    def test_recovery_alerts_once_after_stale_state(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_success_at': (now - timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')
            state_path.write_text(json.dumps({'stale_alerted': True}), encoding='utf-8')

            first = run_once(heartbeat_path, state_path, now=now)
            second = run_once(heartbeat_path, state_path, now=now + timedelta(minutes=1))
            self.assertEqual(first, (
                '✅ LotteReal 문의 watcher 정상 복구\n'
                '현재: 정상 실행 중'
            ))
            self.assertEqual(second, '')
            self.assertEqual(
                json.loads(state_path.read_text(encoding='utf-8')),
                {'stale_alerted': False},
            )
    def test_missing_heartbeat_alerts_once(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'missing-heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)

            first = run_once(heartbeat_path, state_path, now=now)
            second = run_once(heartbeat_path, state_path, now=now + timedelta(minutes=1))
            self.assertIn('Gmail watcher 실행 지연', first)
            self.assertEqual(second, '')
    def test_malformed_heartbeat_fails_closed_without_echoing_content(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            heartbeat_path.write_text(
                '{"last_success_at":"010-1234-5678 private-token"',
                encoding='utf-8',
            )
            message = run_once(
                heartbeat_path,
                state_path,
                now=datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc),
            )
            self.assertIn('Gmail watcher 실행 지연', message)
            self.assertNotIn('010-1234-5678', message)
            self.assertNotIn('private-token', message)
    def test_corrupt_anomaly_state_is_quarantined_and_recovers_silently(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_success_at': (now - timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')
            state_path.write_text('{"private":"010-1234-5678"', encoding='utf-8')

            self.assertEqual(run_once(heartbeat_path, state_path, now=now), '')
            self.assertEqual(
                json.loads(state_path.read_text(encoding='utf-8')),
                {'stale_alerted': False},
            )
            quarantines = list(root.glob('anomaly-state.json.corrupt*'))
            self.assertEqual(len(quarantines), 1)
            self.assertEqual(quarantines[0].stat().st_mode & 0o777, 0o600)
    def test_supabase_alerts_after_two_failures_and_recovers_once(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'anomaly-state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_success_at': (now - timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')

            first = run_once(heartbeat_path, state_path, now=now, supabase_ok=False)
            second = run_once(
                heartbeat_path,
                state_path,
                now=now + timedelta(minutes=1),
                supabase_ok=False,
            )
            third = run_once(
                heartbeat_path,
                state_path,
                now=now + timedelta(minutes=2),
                supabase_ok=False,
            )
            recovery_pending = run_once(
                heartbeat_path,
                state_path,
                now=now + timedelta(minutes=3),
                supabase_ok=True,
            )
            recovered = run_once(
                heartbeat_path,
                state_path,
                now=now + timedelta(minutes=4),
                supabase_ok=True,
            )
            stable = run_once(
                heartbeat_path,
                state_path,
                now=now + timedelta(minutes=5),
                supabase_ok=True,
            )

            self.assertEqual(first, '')
            self.assertIn('Supabase 연결 점검 필요', second)
            self.assertIn('2회 연속 health check 실패', second)
            self.assertEqual(third, '')
            self.assertEqual(recovery_pending, '')
            self.assertIn('Supabase 연결 정상 복구', recovered)
            self.assertEqual(stable, '')
            for message in (second, recovered):
                self.assertNotIn('http', message)
                self.assertNotIn('token', message.lower())
            self.assertEqual(json.loads(state_path.read_text(encoding='utf-8')), {
                'stale_alerted': False,
                'supabase_alerted': False,
                'supabase_failures': 0,
                'supabase_successes': 0,
            })
    def test_supabase_probe_is_read_only_and_collapses_errors(self):
        from scripts.lottereal_inquiry_anomaly_watch import probe_supabase

        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            env_path.write_text(
                'SUPABASE_URL=https://project.supabase.co\n'
                'SUPABASE_SERVICE_ROLE_KEY=fixture-secret\n',
                encoding='utf-8',
            )
            captured = {}

            class Response:
                status = 200

                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    return False

                def read(self, size=-1):
                    captured['read_size'] = size
                    return b'[]'

            def opener(request, timeout):
                captured['url'] = request.full_url
                captured['method'] = request.get_method()
                captured['authorization'] = request.get_header('Authorization')
                captured['timeout'] = timeout
                return Response()

            self.assertTrue(probe_supabase(env_path, opener=opener))
            self.assertEqual(captured['method'], 'GET')
            self.assertEqual(
                captured['url'],
                'https://project.supabase.co/rest/v1/external_inquiry_receipts?select=id&limit=1',
            )
            self.assertEqual(captured['authorization'], 'Bearer fixture-secret')
            self.assertLessEqual(captured['read_size'], 2)
            self.assertLessEqual(captured['timeout'], 10)

            def failing_opener(request, timeout):
                raise RuntimeError('503 response with private body')

            self.assertFalse(probe_supabase(env_path, opener=failing_opener))
    def test_main_is_silent_on_healthy_state_and_records_supabase_result(self):
        from scripts.lottereal_inquiry_anomaly_watch import main

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'state.json'
            env_path = root / '.env'
            heartbeat_path.write_text(json.dumps({
                'last_success_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')
            env_path.write_text('', encoding='utf-8')
            output = io.StringIO()
            environ = {
                'LOTTEREAL_ENV_PATH': str(env_path),
                'LOTTEREAL_GMAIL_WATCH_HEARTBEAT': str(heartbeat_path),
                'LOTTEREAL_INQUIRY_ANOMALY_STATE': str(state_path),
            }

            with redirect_stdout(output):
                code = main(environ=environ, probe=lambda path: True)

            self.assertEqual(code, 0)
            self.assertEqual(output.getvalue(), '')
            self.assertEqual(json.loads(state_path.read_text(encoding='utf-8')), {
                'stale_alerted': False,
                'supabase_alerted': False,
                'supabase_failures': 0,
                'supabase_successes': 0,
            })
    def test_cli_failure_uses_fixed_stderr_without_exception_detail(self):
        from scripts.lottereal_inquiry_anomaly_watch import cli

        output = io.StringIO()

        def fail():
            raise RuntimeError('fixture-secret /opt/data/.env')

        with redirect_stderr(output):
            code = cli(main_fn=fail)

        self.assertEqual(code, 1)
        self.assertEqual(output.getvalue(), 'LotteReal 운영 감시 실행 실패\n')
        self.assertNotIn('fixture-secret', output.getvalue())
        self.assertNotIn('/opt/data/.env', output.getvalue())
    def test_recent_attempt_prevents_duplicate_stale_alert_after_failed_run(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_attempt_at': (now - timedelta(minutes=1)).isoformat().replace('+00:00', 'Z'),
                'last_success_at': (now - timedelta(minutes=30)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')

            self.assertEqual(run_once(heartbeat_path, state_path, now=now), '')
            self.assertEqual(
                json.loads(state_path.read_text(encoding='utf-8')),
                {'stale_alerted': False},
            )
    def test_future_heartbeat_fails_closed_as_stale(self):
        from scripts.lottereal_inquiry_anomaly_watch import run_once

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            heartbeat_path = root / 'heartbeat.json'
            state_path = root / 'state.json'
            now = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
            heartbeat_path.write_text(json.dumps({
                'last_attempt_at': (now + timedelta(days=1)).isoformat().replace('+00:00', 'Z'),
            }), encoding='utf-8')

            message = run_once(heartbeat_path, state_path, now=now)
            self.assertIn('Gmail watcher 실행 지연', message)

    def test_supabase_probe_rejects_redirects_and_noncanonical_hosts(self):
        from scripts.lottereal_inquiry_anomaly_watch import NoRedirectHandler, probe_supabase

        handler = NoRedirectHandler()
        self.assertIsNone(handler.redirect_request(None, None, 302, None, {}, 'https://evil.example'))

        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            env_path.write_text(
                'SUPABASE_URL=https://project.supabase.co@evil.example\n'
                'SUPABASE_SECRET_KEY=fixture-secret\n',
                encoding='utf-8',
            )
            called = False

            def opener(request, timeout):
                nonlocal called
                called = True
                raise AssertionError('opener must not be called')

            self.assertFalse(probe_supabase(env_path, opener=opener))
            self.assertFalse(called)
    def test_no_redirect_opener_never_contacts_redirect_target(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import threading
        from urllib.error import HTTPError
        from urllib.request import Request
        from scripts.lottereal_inquiry_anomaly_watch import _open_without_redirect

        target_requests = []

        class TargetHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                target_requests.append(dict(self.headers))
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                pass

        target = ThreadingHTTPServer(('127.0.0.1', 0), TargetHandler)
        target_thread = threading.Thread(target=target.serve_forever, daemon=True)
        target_thread.start()

        class RedirectHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header(
                    'Location',
                    f'http://127.0.0.1:{target.server_address[1]}/capture',
                )
                self.end_headers()

            def log_message(self, format, *args):
                pass

        redirect = ThreadingHTTPServer(('127.0.0.1', 0), RedirectHandler)
        redirect_thread = threading.Thread(target=redirect.serve_forever, daemon=True)
        redirect_thread.start()
        try:
            request = Request(
                f'http://127.0.0.1:{redirect.server_address[1]}/start',
                headers={
                    'Authorization': 'Bearer fixture-secret',
                    'apikey': 'fixture-secret',
                },
            )
            with self.assertRaises(HTTPError):
                _open_without_redirect(request, timeout=2)
            self.assertEqual(target_requests, [])
        finally:
            redirect.shutdown()
            target.shutdown()
            redirect.server_close()
            target.server_close()
            redirect_thread.join(timeout=2)
            target_thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
