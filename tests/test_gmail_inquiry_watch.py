import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from email.header import Header
from urllib.parse import parse_qs

import scripts.lottereal_gmail_inquiry_watch as gmail_watch
from scripts.lottereal_gmail_inquiry_watch import (
    ZIGBANG_SUBJECT,
    authentication_passes,
    build_alert,
    build_public_receipt_payload,
    classify_inquiry,
    extract_zigbang_inquiry_link,
    fetch_verified_messages,
    message_key,
    parse_zigbang_detail,
    process_items,
    publish_public_receipt,
    record_fallback,
    send_kakao_owner_alert,
)


class GmailInquiryWatchTest(unittest.TestCase):
    def test_accepts_only_verified_zigbang_sender_and_subject(self):
        self.assertEqual(
            classify_inquiry('시스템 자동발송 <cs@zigbang.com>', '직방에서 고객 문의가 들어왔습니다.'),
            '직방',
        )
        self.assertIsNone(
            classify_inquiry('사칭 <attacker@example.com>', '직방에서 고객 문의가 들어왔습니다.')
        )
        self.assertIsNone(
            classify_inquiry('시스템 자동발송 <cs@zigbang.com>', '광고 안내')
        )
        self.assertIsNone(
            classify_inquiry('시스템 자동발송 <cs@zigbang.com.evil.test>', '직방에서 고객 문의가 들어왔습니다.')
        )

    def test_requires_google_authentication_results_aligned_to_zigbang(self):
        trusted = (
            'mx.google.com; dkim=pass header.i=@zigbang.com; '
            'spf=pass smtp.mailfrom=zigbang.com; dmarc=pass header.from=zigbang.com'
        )
        self.assertTrue(authentication_passes([trusted]))
        self.assertFalse(authentication_passes([]))
        self.assertFalse(authentication_passes([
            'mx.google.com; dkim=fail header.i=@zigbang.com; dmarc=fail header.from=zigbang.com'
        ]))
        self.assertFalse(authentication_passes([
            'attacker.example; dkim=pass header.i=@zigbang.com; dmarc=pass header.from=zigbang.com'
        ]))
        self.assertFalse(authentication_passes([
            'mx.google.com; dkim=pass header.i=@evil.example; spf=pass smtp.mailfrom=evil.example; '
            'dmarc=pass header.from=evil.example'
        ]))
        self.assertFalse(authentication_passes([
            'mx.google.com; dkim=pass header.i=@evil.test; spf=pass smtp.mailfrom=evil.test; '
            'dmarc=pass header.from=evil.test; dkim=fail header.i=@zigbang.com; '
            'spf=fail smtp.mailfrom=zigbang.com; dmarc=fail header.from=zigbang.com'
        ]))
        self.assertFalse(authentication_passes([
            'mx.google.com; dkim=pass header.i=@zigbang.com; spf=pass smtp.mailfrom=evil.test; '
            'dmarc=pass header.from=zigbang.com'
        ]))

    def test_alert_contains_only_allowlisted_metadata(self):
        alert = build_alert([{
            'platform': '직방',
            'received_at': '2026-08-29T12:34:56+09:00',
            'sender': '고객 홍길동 <private@example.com>',
            'subject': '서울 송파구 123-45 고객 문의',
            'message_id': '<private-customer-010-1234-5678@example.com>',
            'body': '홍길동 010-1234-5678 상세 주소',
        }])
        self.assertIn('직방 새 고객 문의 1건', alert)
        self.assertIn('Gmail에서 문의 내용을 확인하세요.', alert)
        for private_value in (
            '홍길동', '010-1234-5678', 'private@example.com',
            '서울', '송파구', '123-45', 'message_id', '상세 주소',
        ):
            self.assertNotIn(private_value, alert)

    def test_message_key_is_stable_hash_without_raw_identifier(self):
        raw = '<private-customer-010-1234-5678@example.com>'
        first = message_key(raw)
        self.assertEqual(first, message_key(raw))
        self.assertEqual(len(first), 64)
        self.assertNotIn('private-customer', first)
        self.assertNotIn('010', first)
        self.assertNotEqual(first, message_key('<different@example.com>'))

    def test_fetch_uses_readonly_peek_headers_and_revalidates_sender(self):
        encoded_subject = Header('직방에서 고객 문의가 들어왔습니다.', 'utf-8').encode()

        class FakeImap:
            def __init__(self, *args, **kwargs):
                self.calls = []

            def login(self, address, password):
                self.calls.append(('login', bool(address), bool(password)))
                return 'OK', []

            def select(self, mailbox, readonly=False):
                self.calls.append(('select', mailbox, readonly))
                return 'OK', [b'2']

            def uid(self, command, *args):
                self.calls.append(('uid', command, args))
                if command == 'search':
                    return 'OK', [b'101 102']
                if args[0] == b'101':
                    raw = (
                        'Authentication-Results: mx.google.com; dkim=pass header.i=@zigbang.com; '
                        'spf=pass smtp.mailfrom=zigbang.com; dmarc=pass header.from=zigbang.com\r\n'
                        f'From: cs@zigbang.com\r\nSubject: {encoded_subject}\r\n'
                        'Message-ID: <valid@example.com>\r\n'
                        'Date: Sat, 29 Aug 2099 12:00:00 +0900\r\n\r\n'
                    ).encode('ascii')
                    metadata = b'101 (UID 101 INTERNALDATE "29-Aug-2026 12:34:56 +0900")'
                    return 'OK', [(metadata, raw)]
                raw = (
                    f'From: attacker@example.com\r\nSubject: {encoded_subject}\r\n'
                    'Message-ID: <spoof@example.com>\r\n\r\n'
                ).encode('ascii')
                return 'OK', [(b'102', raw)]

            def logout(self):
                self.calls.append(('logout',))

        fake = FakeImap()
        items = fetch_verified_messages('owner@example.com', 'secret', connector=lambda *a, **k: fake)
        self.assertEqual([item['platform'] for item in items], ['직방'])
        self.assertEqual(items[0]['received_at'], '2026-08-29T12:34:56+09:00')
        self.assertIn(('select', 'INBOX', True), fake.calls)
        fetch_calls = [call for call in fake.calls if call[:2] == ('uid', 'fetch')]
        self.assertTrue(fetch_calls)
        for call in fetch_calls:
            request = str(call)
            self.assertIn('BODY.PEEK[HEADER.FIELDS', request)
            self.assertNotIn('RFC822', request)
            self.assertNotIn('BODY[]', request)

    def test_first_run_baselines_and_only_later_new_key_alerts_once(self):
        first = {'key': 'a' * 64, 'platform': '직방'}
        second = {'key': 'b' * 64, 'platform': '직방'}
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / 'gmail-state.json'
            self.assertEqual(process_items([first], state_path), '')
            self.assertEqual(process_items([first], state_path), '')
            alert = process_items([first, second], state_path)
            self.assertIn('직방 새 고객 문의 1건', alert)
            self.assertEqual(process_items([first, second], state_path), '')
            state = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(state, {
                'initialized': True,
                'seen_keys': ['a' * 64, 'b' * 64],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            })

    def test_fallback_is_emitted_once_without_marking_seen(self):
        item = {'key': 'f' * 64, 'platform': '직방'}
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / 'gmail-state.json'
            state_path.write_text(json.dumps({
                'initialized': True,
                'seen_keys': [],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            }), encoding='utf-8')
            first = record_fallback(state_path, [item])
            second = record_fallback(state_path, [item])
            self.assertEqual(first, '⚠️ 직방 문의 처리 지연 1건. Gmail에서 확인하세요.')
            self.assertEqual(second, '')
            state = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(state['seen_keys'], [])
            self.assertEqual(state['fallback_keys'], ['f' * 64])

    def test_discord_fallback_contains_safe_listing_summary_without_access_token(self):
        key = '9' * 64
        token = '123e4567-e89b-12d3-a456-426614174000'
        item = {
            'key': key,
            'platform': '직방',
            'title': ZIGBANG_SUBJECT,
            'detail_lines': [
                '• 등록번호 50181254',
                '• 송파구 송파동, 3층, 쓰리룸+',
                '• 매매 52000',
                f'• 문의링크 https://sp.zigbang.com/inquiry/list?token={token}',
                '• 고객 홍길동 010-1234-5678 private@example.com',
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / 'state.json'
            state_path.write_text(json.dumps({
                'initialized': True,
                'seen_keys': [],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            }), encoding='utf-8')
            message = record_fallback(state_path, [item])
            for expected in ('카카오 전송 지연', '매물번호 50181254', '송파구 송파동 · 3층 · 쓰리룸+', '매매 5억 2,000만원'):
                self.assertIn(expected, message)
            for forbidden in (token, '문의링크', '홍길동', '010-1234-5678', 'private@example.com'):
                self.assertNotIn(forbidden, message)
            self.assertEqual(record_fallback(state_path, [item]), '')

    def test_main_retries_kakao_after_one_fixed_discord_fallback(self):
        key = 'e' * 64
        item = {
            'key': key,
            'platform': '직방',
            'received_at': '2026-08-29T12:34:56+09:00',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'uid': '101',
        }
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            state_path = Path(directory) / 'state.json'
            env_path.write_text(
                'LOTTEREAL_GMAIL_ADDRESS=owner@example.com\n'
                'LOTTEREAL_GMAIL_APP_PASSWORD=secret\n',
                encoding='utf-8',
            )
            state_path.write_text(json.dumps({
                'initialized': True,
                'seen_keys': [],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            }), encoding='utf-8')
            output = io.StringIO()
            with (
                mock.patch.dict(os.environ, {
                    'LOTTEREAL_ENV_PATH': str(env_path),
                    'LOTTEREAL_GMAIL_WATCH_STATE': str(state_path),
                }),
                mock.patch.object(gmail_watch, 'fetch_verified_messages', return_value=[dict(item)]),
                mock.patch.object(gmail_watch, 'fetch_zigbang_detail', return_value=[
                    '• 등록번호 50181019', '• 전세 16300',
                ]),
                mock.patch.object(gmail_watch, 'publish_public_receipt'),
                mock.patch.object(gmail_watch, 'send_kakao_owner_alert', side_effect=RuntimeError('transient')) as send,
                mock.patch('sys.stdout', output),
            ):
                self.assertEqual(gmail_watch.main(), 0)
                self.assertEqual(gmail_watch.main(), 0)
            fallback_output = output.getvalue()
            self.assertEqual(fallback_output.count('카카오 전송 지연'), 1)
            self.assertIn('매물번호 50181019', fallback_output)
            self.assertIn('전세 1억 6,300만원', fallback_output)
            self.assertNotIn('http', fallback_output)
            self.assertEqual(send.call_count, 2)
            state = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(state['seen_keys'], [])
            self.assertEqual(state['fallback_keys'], [key])

    def test_detail_fetch_exception_does_not_starve_valid_neighbor(self):
        bad_key = '3' * 64
        good_key = '4' * 64
        base = {
            'platform': '직방',
            'received_at': '2026-08-29T12:34:56+09:00',
            'title': '직방에서 고객 문의가 들어왔습니다.',
        }
        items = [
            {**base, 'key': bad_key, 'uid': '201'},
            {**base, 'key': good_key, 'uid': '202'},
        ]
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            state_path = Path(directory) / 'state.json'
            env_path.write_text(
                'LOTTEREAL_GMAIL_ADDRESS=owner@example.com\n'
                'LOTTEREAL_GMAIL_APP_PASSWORD=secret\n',
                encoding='utf-8',
            )
            state_path.write_text(json.dumps({
                'initialized': True,
                'seen_keys': [],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            }), encoding='utf-8')

            def detail(_address, _password, uid):
                if uid == '201':
                    raise OSError('transient')
                return ['• 등록번호 50181019', '• 전세 16300']

            output = io.StringIO()
            with (
                mock.patch.dict(os.environ, {
                    'LOTTEREAL_ENV_PATH': str(env_path),
                    'LOTTEREAL_GMAIL_WATCH_STATE': str(state_path),
                }),
                mock.patch.object(gmail_watch, 'fetch_verified_messages', return_value=items),
                mock.patch.object(gmail_watch, 'fetch_zigbang_detail', side_effect=detail),
                mock.patch.object(gmail_watch, 'publish_public_receipt') as publish,
                mock.patch.object(gmail_watch, 'send_kakao_owner_alert', return_value={}) as send,
                mock.patch.object(gmail_watch, 'update_private_env'),
                mock.patch('sys.stdout', output),
            ):
                self.assertEqual(gmail_watch.main(), 0)

            self.assertEqual(publish.call_count, 1)
            self.assertEqual(send.call_count, 1)
            state = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(state['seen_keys'], [good_key])
            self.assertEqual(state['parse_failures'], {})
            self.assertEqual(state['dead_keys'], [])
            self.assertEqual(state['fallback_keys'], [bad_key])
            self.assertEqual(
                output.getvalue(),
                '⚠️ 직방 문의 처리 지연 1건. Gmail에서 확인하세요.\n',
            )

    def test_malformed_message_does_not_starve_valid_and_dead_letters_after_three_runs(self):
        bad_key = '1' * 64
        good_key = '2' * 64
        bad = {
            'key': bad_key,
            'platform': '직방',
            'received_at': '2026-08-29T12:34:56+09:00',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'uid': '101',
        }
        good = {**bad, 'key': good_key, 'uid': '102'}
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            state_path = Path(directory) / 'state.json'
            env_path.write_text(
                'LOTTEREAL_GMAIL_ADDRESS=owner@example.com\n'
                'LOTTEREAL_GMAIL_APP_PASSWORD=secret\n',
                encoding='utf-8',
            )
            state_path.write_text(json.dumps({
                'initialized': True,
                'seen_keys': [],
                'fallback_keys': [],
                'parse_failures': {},
                'dead_keys': [],
            }), encoding='utf-8')
            output = io.StringIO()

            def detail(_address, _password, uid):
                return [] if uid == '101' else ['• 등록번호 50181019', '• 전세 16300']

            with (
                mock.patch.dict(os.environ, {
                    'LOTTEREAL_ENV_PATH': str(env_path),
                    'LOTTEREAL_GMAIL_WATCH_STATE': str(state_path),
                }),
                mock.patch.object(gmail_watch, 'fetch_verified_messages', return_value=[dict(bad), dict(good)]),
                mock.patch.object(gmail_watch, 'fetch_zigbang_detail', side_effect=detail) as fetch_detail,
                mock.patch.object(gmail_watch, 'publish_public_receipt') as publish,
                mock.patch.object(gmail_watch, 'send_kakao_owner_alert', return_value={}) as send,
                mock.patch.object(gmail_watch, 'update_private_env'),
                mock.patch('sys.stdout', output),
            ):
                for _ in range(4):
                    self.assertEqual(gmail_watch.main(), 0)

            self.assertEqual(publish.call_count, 1)
            self.assertEqual(send.call_count, 1)
            self.assertEqual(fetch_detail.call_count, 4)
            state = json.loads(state_path.read_text(encoding='utf-8'))
            self.assertEqual(state['seen_keys'], [good_key])
            self.assertEqual(state['dead_keys'], [bad_key])
            self.assertEqual(state['parse_failures'], {})
            self.assertEqual(
                output.getvalue(),
                '⚠️ 직방 문의 처리 지연 1건. Gmail에서 확인하세요.\n'
                '⚠️ 직방 문의 자동 처리 제외 1건. Gmail에서 확인하세요.\n',
            )

    def test_runtime_failure_stderr_is_fixed_and_contains_no_secret_path(self):
        script = Path(__file__).parents[1] / 'scripts' / 'lottereal_gmail_inquiry_watch.py'
        environment = {
            **os.environ,
            'LOTTEREAL_ENV_PATH': '/proc/PRIVATE-GMAIL-SECRET.env',
            'LOTTEREAL_GMAIL_WATCH_STATE': '/tmp/gmail-watch-test-state.json',
        }
        result = subprocess.run(
            [sys.executable, str(script)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stderr, 'Gmail inquiry watcher failed.\n')
        self.assertEqual(result.stdout, '')

    def test_kakao_refreshes_token_and_sends_only_safe_alert(self):
        requests = []

        class Response(io.BytesIO):
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        def opener(request, timeout):
            requests.append(request)
            if request.full_url.endswith('/oauth/token'):
                return Response(json.dumps({
                    'access_token': 'new-access',
                    'expires_in': 21599,
                }).encode())
            return Response(b'{"result_code": 0}')

        values = {
            'LOTTEREAL_KAKAO_REST_API_KEY': 'rest-key',
            'LOTTEREAL_KAKAO_CLIENT_Login_SECRET': 'login-secret',
            'LOTTEREAL_KAKAO_REFRESH_TOKEN': 'refresh-token',
        }
        inquiry_link = 'https://sp.zigbang.com/inquiry/list?token=123e4567-e89b-12d3-a456-426614174000'
        updates = send_kakao_owner_alert(
            values,
            '📨 직방 새 고객 문의 1건\nGmail에서 문의 내용을 확인하세요.',
            inquiry_link=inquiry_link,
            opener=opener,
        )
        self.assertEqual(updates['LOTTEREAL_KAKAO_ACCESS_TOKEN'], 'new-access')
        self.assertEqual(len(requests), 2)
        refresh_body = requests[0].data.decode()
        self.assertIn('grant_type=refresh_token', refresh_body)
        self.assertIn('client_secret=login-secret', refresh_body)
        send_body = requests[1].data.decode()
        self.assertIn('template_object=', send_body)
        template = json.loads(parse_qs(send_body)['template_object'][0])
        expected_button_link = f'https://lottes.co.kr/redirect/zigbang-inquiry.html#token={inquiry_link.rsplit("=", 1)[1]}'
        self.assertEqual(template['link']['web_url'], expected_button_link)
        self.assertEqual(template['link']['mobile_web_url'], expected_button_link)
        self.assertEqual(template['button_title'], '직방 문의 바로보기')
        self.assertNotIn('refresh-token', send_body)
        self.assertNotIn('login-secret', send_body)

    def test_html_parser_extracts_listing_lines_without_contact_or_footer(self):
        html_body = '''
        <html><body><div>고객 문의가 들어왔습니다.</div>
        <div>[매물정보]</div>
        <div>• 등록번호 50181019</div>
        <div>• 송파구 삼전동, 반지하층, 쓰리룸+ 대표 02-568-4908</div>
        <div>• 전세 16300</div>
        <a href="https://example.test/customer-token">연락처 확인하기</a>
        <div>고객 010-1234-5678 customer@example.com</div>
        <div>(주)직방 | 사업자등록번호 120-87-61559</div>
        </body></html>
        '''
        detail = parse_zigbang_detail(html_body)
        self.assertEqual(detail, [
            '• 등록번호 50181019',
            '• 전세 16300',
        ])
        alert = build_alert([{
            'platform': '직방',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'detail_lines': detail,
        }])
        self.assertIn('제목: 직방에서 고객 문의가 들어왔습니다.', alert)
        self.assertIn('매물번호 50181019', alert)
        self.assertNotIn('010-1234-5678', alert)
        self.assertNotIn('02-568-4908', alert)
        self.assertNotIn('customer@example.com', alert)
        self.assertNotIn('customer-token', alert)
        self.assertNotIn('사업자등록번호', alert)
        defense_alert = build_alert([{
            'platform': '직방',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'detail_lines': ['• 등록번호 50181019', '• 담당자 홍길동 010.1234.5678'],
        }])
        self.assertIn('매물번호 50181019', defense_alert)
        self.assertNotIn('홍길동', defense_alert)
        self.assertNotIn('010.1234.5678', defense_alert)

    def test_rich_owner_alert_accepts_only_coarse_listing_data_and_exact_zigbang_link(self):
        token = '123e4567-e89b-12d3-a456-426614174000'
        html_body = f'''<html><body>
        <div>[매물정보]</div>
        <div>• 등록번호 50181254</div>
        <div>• 송파구 송파동, 3층, 쓰리룸+</div>
        <div>• 매매 52000</div>
        <a href="https://sp.zigbang.com/inquiry/list?token={token}">연락처 확인하기</a>
        <div>고객 홍길동 010-1234-5678 private@example.com</div>
        </body></html>'''
        detail = parse_zigbang_detail(html_body)
        self.assertEqual(detail, [
            '• 등록번호 50181254',
            '• 송파구 송파동, 3층, 쓰리룸+',
            '• 매매 52000',
            f'• 문의링크 https://sp.zigbang.com/inquiry/list?token={token}',
        ])
        link = extract_zigbang_inquiry_link(detail)
        self.assertEqual(link, f'https://sp.zigbang.com/inquiry/list?token={token}')
        alert = build_alert([{
            'platform': '직방',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'detail_lines': detail,
        }])
        for expected in ('매물번호 50181254', '송파구 송파동 · 3층 · 쓰리룸+', '매매 5억 2,000만원'):
            self.assertIn(expected, alert)
        for private_value in ('홍길동', '010-1234-5678', 'private@example.com', token, '문의링크'):
            self.assertNotIn(private_value, alert)

    def test_rejects_token_links_outside_exact_allowlist(self):
        token = '123e4567-e89b-12d3-a456-426614174000'
        unsafe_links = (
            f'http://sp.zigbang.com/inquiry/list?token={token}',
            f'https://sp.zigbang.com.evil.test/inquiry/list?token={token}',
            f'https://sp.zigbang.com/inquiry/other?token={token}',
            f'https://sp.zigbang.com/inquiry/list?token={token}&next=https://evil.test',
            'https://sp.zigbang.com/inquiry/list?token=not-a-uuid',
        )
        for link in unsafe_links:
            html = f'''<div>[매물정보]</div>
            <div>• 등록번호 50181254</div>
            <div>• 송파구 송파동, 3층, 투룸</div>
            <div>• 매매 52000</div>
            <a href="{link}">연락처 확인하기</a>'''
            detail = parse_zigbang_detail(html)
            self.assertIsNone(extract_zigbang_inquiry_link(detail))
            self.assertFalse(any('문의링크' in line for line in detail))

    def test_html_parser_masks_korean_phone_format_variants(self):
        html = '''<html><body>
        <div>• 담당자 010.1234.5678</div>
        <div>• 사무실 (02) 1234-5678</div>
        <div>• 해외 +82 10-1234-5678</div>
        </body></html>'''
        detail = parse_zigbang_detail(html)
        joined = '\n'.join(detail)
        for raw in ('010.1234.5678', '(02) 1234-5678', '+82 10-1234-5678'):
            self.assertNotIn(raw, joined)
        self.assertEqual(detail, [])

    def test_public_receipt_payload_is_hour_bucketed_and_contains_no_content(self):
        item = {
            'key': 'c' * 64,
            'platform': '직방',
            'received_at': 'Sat, 29 Aug 2026 12:34:56 +0900',
            'title': '직방에서 고객 문의가 들어왔습니다.',
            'detail_lines': [
                '• 등록번호 50181019',
                '• 송파구 삼전동, 반지하층, 쓰리룸+',
                '• 전세 16300',
            ],
        }
        payload = build_public_receipt_payload(item)
        self.assertEqual(payload, {
            'source': 'zigbang',
            'listing_number': '50181019',
            'transaction_type': '전세',
            'received_hour': '2026-08-29T12:00:00+09:00',
            'status': 'received',
            'source_message_hash': 'c' * 64,
        })
        serialized = json.dumps(payload, ensure_ascii=False)
        self.assertIn('전세', serialized)
        for private_value in ('삼전동', '반지하', '쓰리룸', '16300', '고객 문의'):
            self.assertNotIn(private_value, serialized)

    def test_public_receipt_writer_rejects_extra_or_private_fields(self):
        safe = {
            'source': 'zigbang',
            'listing_number': '50181019',
            'transaction_type': '전세',
            'received_hour': '2026-08-29T12:00:00+09:00',
            'status': 'received',
            'source_message_hash': 'd' * 64,
        }
        values = {'SUPABASE_URL': 'https://project.supabase.co', 'SUPABASE_SECRET_KEY': 'private'}

        class Response(io.BytesIO):
            status = 201

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        requests = []
        publish_public_receipt(
            values,
            safe,
            opener=lambda request, timeout: requests.append(request) or Response(b''),
        )
        self.assertEqual(len(requests), 1)
        self.assertEqual(json.loads(requests[0].data), safe)
        with self.assertRaises(ValueError):
            publish_public_receipt(
                values,
                {**safe, 'message': '고객 전화 02-123-4567'},
                opener=lambda *_a, **_k: Response(b''),
            )


if __name__ == '__main__':
    unittest.main()
