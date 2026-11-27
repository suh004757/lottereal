import contextlib
from datetime import datetime, timezone
from email.message import EmailMessage
import hashlib
import io
import json
import unittest
from unittest.mock import patch


NOW = datetime(2026, 11, 28, 1, tzinfo=timezone.utc)
CUTOFF = '2026-11-28T00:00:00+00:00'
VALUES = {
    'LOTTEREAL_GMAIL_ADDRESS': 'fixture@example.invalid',
    'LOTTEREAL_GMAIL_APP_PASSWORD': 'fixture password',
    'SUPABASE_URL': 'https://fixture.supabase.co',
    'SUPABASE_SECRET_KEY': 'fixture-service-key',
}
AUTH = ('mx.google.com; dkim=pass header.i=@zigbang.com; '
        'spf=pass smtp.mailfrom=cs@zigbang.com; dmarc=pass header.from=zigbang.com')


def mail(uid, stamp='28-Nov-2026 09:17:00 +0900', auth=AUTH):
    message = EmailMessage()
    message['From'] = 'cs@zigbang.com'
    message['Subject'] = '직방에서 고객 문의가 들어왔습니다.'
    message['Message-ID'] = f'<fixture-{uid}@example.invalid>'
    message['Authentication-Results'] = auth
    message.set_content(
        '<p>[매물정보]</p><p>• 등록번호 123456</p>'
        '<p>• 송파구 송파동, 3층, 쓰리룸+</p><p>• 월세 5000/80</p>'
        '<a href="https://sp.zigbang.com/inquiry/list?token='
        '123e4567-e89b-12d3-a456-426614174000">연락처 확인하기</a>'
        '<p>private fixture body</p>', subtype='html',
    )
    headers, _ = message.as_bytes().split(b'\n\n', 1)
    return stamp, headers + b'\n\n', message.as_bytes()


class Inbox:
    def __init__(self, messages, *, fail=None):
        self.messages = messages
        self.fail = fail
        self.bodies = []
        self.closed = False

    def __call__(self, host, port, **kwargs):
        assert (host, port) == ('imap.gmail.com', 993)
        return self

    def login(self, address, password):
        assert address == VALUES['LOTTEREAL_GMAIL_ADDRESS']
        assert password == 'fixturepassword'
        return 'OK', []

    def select(self, mailbox, *, readonly):
        assert mailbox == 'INBOX' and readonly
        return 'OK', []

    def uid(self, command, *args):
        if command == 'search':
            return 'OK', [b' '.join(self.messages)]
        assert command == 'fetch'
        uid, query = args
        stamp, headers, body = self.messages[uid]
        if 'HEADER.FIELDS' in query:
            assert 'INTERNALDATE' in query and 'BODY.PEEK[' in query
            return 'OK', [(f'1 (INTERNALDATE "{stamp}"'.encode(), headers), b')']
        assert 'BODY.PEEK[]' in query
        self.bodies.append(uid)
        if self.fail == 'body':
            return 'NO', [b'private transport error']
        return 'OK', [(b'1 (BODY[]', body), b')']

    def logout(self):
        self.closed = True


class ReceiptAPI:
    status = 201

    def __init__(self):
        self.rows = {}
        self.calls = []

    def __call__(self, request, *, timeout):
        self.calls.append(request)
        assert request.get_method() == 'POST'
        assert request.full_url == ('https://fixture.supabase.co/rest/v1/'
                                    'external_inquiry_receipts?on_conflict=source_message_hash')
        assert request.get_header('Prefer') == 'resolution=ignore-duplicates,return=minimal'
        payload = json.loads(request.data)
        if self.status == 201:
            self.rows.setdefault(payload['source_message_hash'], payload)
        return contextlib.nullcontext(self)


class QuietReceiptsTest(unittest.TestCase):
    def run_job(self, inbox, api, cutoff=CUTOFF, values=VALUES):
        from scripts import pf_zigbang_receipts as job

        stdout, stderr = io.StringIO(), io.StringIO()
        with (contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr),
              patch.dict('os.environ', {'PF_ZIGBANG_RECEIPTS_SINCE': cutoff}, clear=True),
              patch.object(job, 'load_private_env', return_value=values)):
            result = job.main(connector=inbox, opener=api, now=NOW)
        self.assertEqual((stdout.getvalue(), stderr.getvalue()), ('', ''))
        return result

    def test_only_authenticated_post_cutoff_mail_writes_allowlisted_receipt(self):
        inbox = Inbox({
            b'1': mail(1, stamp='28-Nov-2026 08:59:59 +0900'),
            b'2': mail(2, stamp='28-Nov-2026 09:00:00 +0900'),
            b'3': mail(3, auth=AUTH.replace('dkim=pass', 'dkim=fail')),
            b'4': mail(4),
        })
        api = ReceiptAPI()
        self.assertEqual(self.run_job(inbox, api), 0)
        self.assertTrue(inbox.closed)
        self.assertEqual(inbox.bodies, [b'4'])
        key = hashlib.sha256(b'<fixture-4@example.invalid>').hexdigest()
        self.assertEqual(list(api.rows.values()), [{
            'source': 'zigbang', 'listing_number': '123456', 'transaction_type': '월세',
            'received_hour': '2026-11-28T09:00:00+09:00', 'status': 'received',
            'source_message_hash': key,
        }])

    def test_replay_cannot_overwrite_existing_receipt(self):
        inbox, api = Inbox({b'1': mail(1)}), ReceiptAPI()
        self.assertEqual(self.run_job(inbox, api), 0)
        row = next(iter(api.rows.values()))
        self.assertEqual(self.run_job(inbox, api), 0)
        self.assertEqual(len(api.calls), 2)
        self.assertEqual(len(api.rows), 1)
        self.assertIs(next(iter(api.rows.values())), row)

    def test_transport_failure_is_silent_and_returns_failure(self):
        inbox, api = Inbox({b'1': mail(1)}, fail='body'), ReceiptAPI()
        self.assertNotEqual(self.run_job(inbox, api), 0)
        self.assertTrue(inbox.closed)
        self.assertEqual(api.calls, [])
        inbox, api = Inbox({b'1': mail(1)}), ReceiptAPI()
        api.status = 503
        self.assertNotEqual(self.run_job(inbox, api), 0)
        self.assertEqual(len(api.calls), 1)

    def test_missing_or_naive_cutoff_and_missing_server_key_fail_before_io(self):
        for cutoff, values in [('', VALUES), ('2026-11-28T00:00:00', VALUES),
                               (CUTOFF, {**VALUES, 'SUPABASE_SECRET_KEY': ''})]:
            with self.subTest(cutoff=cutoff):
                forbidden = lambda *args, **kwargs: self.fail('unexpected external I/O')
                self.assertNotEqual(self.run_job(forbidden, forbidden, cutoff, values), 0)
