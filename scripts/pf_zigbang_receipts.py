#!/usr/bin/env python3
"""Server-only receipt collector. Set PF_ZIGBANG_RECEIPTS_SINCE to the fixed
activation instant (ISO 8601 with offset). No mailbox changes or output.
"""

from contextlib import suppress
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from email.errors import HeaderParseError
import imaplib
import json
import os
from pathlib import Path
import re
import ssl
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

if __package__:
    from . import lottereal_gmail_inquiry_watch as mail
else:
    import lottereal_gmail_inquiry_watch as mail

load_private_env = mail.load_private_env
_MAX_MESSAGE_BYTES = 512_000
_KST = ZoneInfo('Asia/Seoul')
_MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _fetch(connection, uid, query):
    status, parts = connection.uid('fetch', uid, query)
    if status != 'OK':
        raise OSError('Gmail fetch failed')
    literals = [part for part in parts if isinstance(part, tuple)]
    if len(literals) != 1:
        raise OSError('Gmail message unavailable')
    return literals[0]


def _verified_identity(metadata, raw, cutoff, now):
    received_match = re.search(rb'\bINTERNALDATE "([^"]+)"', metadata)
    if received_match is None:
        raise OSError('Gmail INTERNALDATE unavailable')
    received = datetime.strptime(received_match[1].decode('ascii'), '%d-%b-%Y %H:%M:%S %z')
    hour = received.astimezone(_KST).replace(minute=0, second=0, microsecond=0)
    if (received <= cutoff or hour < now - timedelta(days=30)
            or received > now + timedelta(minutes=5)):
        return None
    headers = message_from_bytes(raw)
    for name in ('From', 'Subject', 'Message-ID'):
        if len(headers.get_all(name, [])) != 1:
            return None
    try:
        sender = mail.decode_header_value(headers['From'])
        subject = mail.decode_header_value(headers['Subject'])
    except (HeaderParseError, LookupError, UnicodeError):
        return None
    message_id = headers['Message-ID'].strip()
    if (mail.classify_inquiry(sender, subject) and message_id
            and mail.authentication_passes(headers.get_all('Authentication-Results', []))):
        return hour, mail.message_key(message_id)
    return None


def _receipt(raw, hour, source_hash):
    if len(raw) > _MAX_MESSAGE_BYTES:
        return None
    for part in message_from_bytes(raw).walk():
        if part.get_content_type() != 'text/html' or part.get_content_disposition() == 'attachment':
            continue
        body = part.get_payload(decode=True)
        if not isinstance(body, bytes) or not body or len(body) > 250_000:
            return None
        try:
            details = mail.parse_zigbang_detail(
                body.decode(part.get_content_charset() or 'utf-8', errors='replace')
            )
        except LookupError:
            return None
        if not details:
            return None
        listing = re.fullmatch(r'• 등록번호 ([0-9]{5,20})', details[0])
        transaction = re.fullmatch(r'• (전세|매매) [0-9]{1,9}|• (월세) [0-9]{1,9}/[0-9]{1,9}', details[2])
        if listing and transaction:
            return {
                'source': 'zigbang',
                'listing_number': listing[1],
                'transaction_type': transaction[1] or transaction[2],
                'received_hour': hour.isoformat(),
                'status': 'received',
                'source_message_hash': source_hash,
            }
        return None
    return None


def _collect(connection, cutoff, now):
    status, _ = connection.select('INBOX', readonly=True)
    if status != 'OK':
        raise OSError('Gmail inbox unavailable')
    # IMAP SINCE compares calendar dates, not exact instants. Widen by a day;
    # the authoritative per-message comparison uses the full INTERNALDATE.
    earliest = max(cutoff, now - timedelta(days=30)) - timedelta(days=1)
    date = f'{earliest.day:02d}-{_MONTHS[earliest.month - 1]}-{earliest.year:04d}'
    status, data = connection.uid('search', None, 'FROM', mail.ZIGBANG_SENDER, 'SINCE', date)
    if status != 'OK' or not data or not isinstance(data[0], bytes):
        raise OSError('Gmail search failed')
    for uid in data[0].split():
        metadata, headers = _fetch(
            connection, uid,
            '(INTERNALDATE BODY.PEEK[HEADER.FIELDS (AUTHENTICATION-RESULTS FROM SUBJECT MESSAGE-ID)])',
        )
        identity = _verified_identity(metadata, headers, cutoff, now)
        if identity is None:
            continue
        _, raw = _fetch(connection, uid, f'(BODY.PEEK[]<0.{_MAX_MESSAGE_BYTES + 1}>)')
        payload = _receipt(raw, *identity)
        if payload is not None:
            yield payload


def _insert(opener, url, key, payload):
    request = Request(
        f'{url}/rest/v1/external_inquiry_receipts?on_conflict=source_message_hash',
        method='POST',
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=ignore-duplicates,return=minimal',
        },
    )
    with opener(request, timeout=20) as response:
        if not 200 <= response.status < 300:
            raise OSError('Receipt insert failed')


def main(*, connector=imaplib.IMAP4_SSL, opener=None, now=None) -> int:
    """Return 1 on configuration/transport failure; do not log raw errors."""
    try:
        cutoff = datetime.fromisoformat(os.environ.get('PF_ZIGBANG_RECEIPTS_SINCE', ''))
        now = now or datetime.now(timezone.utc)
        if cutoff.tzinfo is None or cutoff > now:
            return 1
        cutoff = cutoff.astimezone(timezone.utc)
        values = load_private_env(Path(os.environ.get('LOTTEREAL_ENV_PATH', mail.DEFAULT_ENV_PATH)))
        address = values.get('LOTTEREAL_GMAIL_ADDRESS', '')
        password = values.get('LOTTEREAL_GMAIL_APP_PASSWORD', '').replace(' ', '')
        url = values.get('SUPABASE_URL', '').rstrip('/')
        key = values.get('SUPABASE_SECRET_KEY') or values.get('SUPABASE_SERVICE_ROLE_KEY')
        if not address or not password or not key or not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', url):
            return 1
        opener = opener or build_opener(_NoRedirect()).open
        connection = connector('imap.gmail.com', 993, ssl_context=ssl.create_default_context(), timeout=20)
        try:
            status, _ = connection.login(address, password)
            if status != 'OK':
                return 1
            for payload in _collect(connection, cutoff, now):
                _insert(opener, url, key, payload)
        finally:
            with suppress(OSError, imaplib.IMAP4.error):
                connection.logout()
    except (OSError, imaplib.IMAP4.error, ValueError, OverflowError):
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
