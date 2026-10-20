#!/usr/bin/env python3
"""Read-only Gmail inquiry watcher for verified listing-platform mail."""

from __future__ import annotations

from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from datetime import datetime, timedelta, timezone
from html import unescape
from html.parser import HTMLParser
import fcntl
import hashlib
import imaplib
import json
import os
from pathlib import Path
import re
import ssl
import sys
import time
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import UUID
from zoneinfo import ZoneInfo

ZIGBANG_SENDER = 'cs@zigbang.com'
ZIGBANG_SUBJECT = '직방에서 고객 문의가 들어왔습니다.'
DEFAULT_ENV_PATH = Path('/opt/data/.env')
DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal/gmail-inquiry-watch.json')
DEFAULT_HEARTBEAT_PATH = Path('/opt/data/state/lottereal/gmail-inquiry-watch-heartbeat.json')
SONGPA_LEGAL_DONGS = frozenset({
    '가락동', '거여동', '마천동', '문정동', '방이동', '삼전동', '석촌동',
    '송파동', '신천동', '오금동', '잠실동', '장지동', '풍납동',
})
MAX_DELIVERY_BATCH = 10
RETRY_RESERVE = 5
MAX_RETRY_DELAY = timedelta(hours=6)
FALLBACK_WARNING_COOLDOWN = timedelta(hours=6)


class UnsupportedQueueVersion(RuntimeError):
    """State belongs to a newer or incompatible queue runtime."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def classify_inquiry(sender: str, subject: str) -> str | None:
    address = parseaddr(str(sender or ''))[1].strip().lower()
    normalized_subject = ' '.join(str(subject or '').split())
    if address == ZIGBANG_SENDER and normalized_subject == ZIGBANG_SUBJECT:
        return '직방'
    return None


def authentication_passes(headers: list[str]) -> bool:
    if not headers:
        return False
    trusted = ' '.join(str(headers[0]).lower().split())
    if not trusted.startswith('mx.google.com;'):
        return False

    segments = [segment.strip() for segment in trusted.split(';')[1:]]

    def aligned_pass(mechanism: str, identity_field: str) -> bool:
        for segment in segments:
            if not re.match(rf'^{mechanism}=pass\b', segment):
                continue
            match = re.search(rf'\b{re.escape(identity_field)}=([^\s;]+)', segment)
            if not match:
                continue
            identity = match.group(1).strip('<>')
            domain = identity.rsplit('@', 1)[-1].rstrip('.').lower()
            if domain == 'zigbang.com':
                return True
        return False

    return all((
        aligned_pass('dkim', 'header.i'),
        aligned_pass('spf', 'smtp.mailfrom'),
        aligned_pass('dmarc', 'header.from'),
    ))


def message_key(message_id: str) -> str:
    return hashlib.sha256(str(message_id).encode('utf-8')).hexdigest()


def decode_header_value(value: str) -> str:
    return str(make_header(decode_header(value or '')))


def fetch_verified_messages(
    address: str,
    password: str,
    *,
    connector=imaplib.IMAP4_SSL,
) -> list[dict]:
    connection = connector(
        'imap.gmail.com',
        993,
        ssl_context=ssl.create_default_context(),
        timeout=20,
    )
    try:
        connection.login(address, password.replace(' ', ''))
        status, _ = connection.select('INBOX', readonly=True)
        if status != 'OK':
            raise RuntimeError('readonly inbox unavailable')
        status, data = connection.uid(  # type: ignore[arg-type]
            'search', None, 'X-GM-RAW', '"from:cs@zigbang.com newer_than:30d"'
        )
        if status != 'OK':
            raise RuntimeError('gmail search failed')
        identifiers = data[0].split() if data and data[0] else []
        verified = []
        for identifier in identifiers[-100:]:
            status, parts = connection.uid(
                'fetch',
                identifier,
                '(INTERNALDATE BODY.PEEK[HEADER.FIELDS (AUTHENTICATION-RESULTS FROM SUBJECT MESSAGE-ID)])',
            )
            if status != 'OK':
                continue
            tuple_part = next((part for part in parts if isinstance(part, tuple)), None)
            if not tuple_part:
                continue
            metadata, raw = tuple_part
            internal_match = re.search(rb'INTERNALDATE "([^"]+)"', metadata)
            if not internal_match:
                continue
            try:
                trusted_received = datetime.strptime(
                    internal_match.group(1).decode('ascii'),
                    '%d-%b-%Y %H:%M:%S %z',
                ).isoformat()
            except (UnicodeDecodeError, ValueError):
                continue
            parsed = message_from_bytes(raw)
            sender = decode_header_value(parsed.get('From', ''))
            subject = decode_header_value(parsed.get('Subject', ''))
            platform = classify_inquiry(sender, subject)
            authenticated = authentication_passes(parsed.get_all('Authentication-Results', []))
            identifier_header = parsed.get('Message-ID', '').strip()
            if platform and authenticated and identifier_header:
                verified.append({
                    'key': message_key(identifier_header),
                    'platform': platform,
                    'received_at': trusted_received,
                    'title': ZIGBANG_SUBJECT,
                    'uid': identifier.decode('ascii'),
                })
        return verified
    finally:
        try:
            connection.logout()
        except Exception:
            pass


def fetch_zigbang_detail(
    address: str,
    password: str,
    uid: str,
    *,
    connector=imaplib.IMAP4_SSL,
) -> list[str]:
    if not re.fullmatch(r'\d{1,20}', uid):
        return []
    connection = connector(
        'imap.gmail.com',
        993,
        ssl_context=ssl.create_default_context(),
        timeout=20,
    )
    try:
        connection.login(address, password.replace(' ', ''))
        status, _ = connection.select('INBOX', readonly=True)
        if status != 'OK':
            raise RuntimeError('readonly inbox unavailable')
        status, parts = connection.uid('fetch', uid, '(BODY.PEEK[])')
        if status != 'OK':
            return []
        raw = next((part[1] for part in parts if isinstance(part, tuple)), b'')
        if not raw or len(raw) > 512_000:
            return []
        message = message_from_bytes(raw)
        for part in message.walk():
            if part.get_content_type() != 'text/html':
                continue
            payload = part.get_payload(decode=True)
            if not isinstance(payload, (bytes, bytearray)):
                continue
            if len(payload) > 250_000:
                return []
            charset = part.get_content_charset() or 'utf-8'
            return parse_zigbang_detail(bytes(payload).decode(charset, errors='replace'))
        return []
    finally:
        try:
            connection.logout()
        except Exception:
            pass


class _HtmlText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.links: list[str] = []
        self.events: list[tuple[str, str, str | None]] = []
        self._anchor_href: str | None = None
        self._anchor_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != 'a' or self._anchor_href is not None:
            return
        href = dict(attrs).get('href')
        if isinstance(href, str):
            self._anchor_href = unescape(href)
            self._anchor_parts = []
            self.links.append(self._anchor_href)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != 'a' or self._anchor_href is None:
            return
        label = ' '.join(' '.join(self._anchor_parts).split())
        self.events.append(('anchor', label, self._anchor_href))
        self._anchor_href = None
        self._anchor_parts = []

    def handle_data(self, data: str) -> None:
        normalized = ' '.join(unescape(data).split())
        if not normalized:
            return
        self.parts.append(normalized)
        if self._anchor_href is not None:
            self._anchor_parts.append(normalized)
        else:
            self.events.append(('text', normalized, None))


def normalize_zigbang_inquiry_link(value: str) -> str | None:
    try:
        parsed = urlparse(str(value or ''))
        if (
            parsed.scheme != 'https'
            or parsed.netloc != 'sp.zigbang.com'
            or parsed.hostname != 'sp.zigbang.com'
            or parsed.port is not None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path != '/inquiry/list'
            or parsed.params
            or parsed.fragment
        ):
            return None
        raw_match = re.fullmatch(
            r'token=([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})',
            parsed.query,
        )
        if not raw_match:
            return None
        token = raw_match.group(1)
        canonical = str(UUID(token))
        if token != canonical or parsed.query != f'token={canonical}':
            return None
        return f'https://sp.zigbang.com/inquiry/list?token={canonical}'
    except (ValueError, TypeError):
        return None


def _normalize_zigbang_location_line(value: str) -> str | None:
    match = re.fullmatch(
        r'• 송파구 ([가-힣]{1,10}), ((?:[1-9][0-9]?층|반지하층)), '
        r'(오픈형 원룸|분리형 원룸|투룸|쓰리룸\+)',
        str(value or ''),
    )
    if not match or match.group(1) not in SONGPA_LEGAL_DONGS:
        return None
    return f'• 송파구 {match.group(1)}, {match.group(2)}, {match.group(3)}'


def _normalize_zigbang_transaction_line(value: str) -> str | None:
    raw = str(value or '')
    sale = re.fullmatch(r'• (전세|매매) ([0-9]{1,9})', raw)
    if sale:
        return raw
    rent = re.fullmatch(r'• 월세 ([0-9]{1,9})\s*/\s*([0-9]{1,9})', raw)
    if rent:
        return f'• 월세 {rent.group(1)}/{rent.group(2)}'
    return None


def extract_zigbang_inquiry_link(detail_lines: list[str]) -> str | None:
    if not isinstance(detail_lines, list):
        return None
    for line in detail_lines:
        if not isinstance(line, str) or not line.startswith('• 문의링크 '):
            continue
        return normalize_zigbang_inquiry_link(line.removeprefix('• 문의링크 '))
    return None


def build_kakao_inquiry_button_link(inquiry_link: str) -> str | None:
    safe_link = normalize_zigbang_inquiry_link(inquiry_link)
    if not safe_link:
        return None
    token = safe_link.removeprefix('https://sp.zigbang.com/inquiry/list?token=')
    return f'https://lottes.co.kr/redirect/zigbang-inquiry.html#token={token}'


def parse_zigbang_detail(html_body: str) -> list[str]:
    parser = _HtmlText()
    parser.feed(str(html_body or '')[:250_000])
    candidates: list[list[str]] = []
    for index in range(max(0, len(parser.events) - 4)):
        marker, listing_event, location_event, transaction_event, link_event = parser.events[index:index + 5]
        if marker != ('text', '[매물정보]', None):
            continue
        if listing_event[0] != 'text' or not re.fullmatch(r'• 등록번호 [0-9]{5,20}', listing_event[1]):
            continue
        if location_event[0] != 'text':
            continue
        location = _normalize_zigbang_location_line(location_event[1])
        if not location:
            continue
        if transaction_event[0] != 'text':
            continue
        transaction = _normalize_zigbang_transaction_line(transaction_event[1])
        if not transaction:
            continue
        if link_event[0] != 'anchor' or link_event[1] != '연락처 확인하기':
            continue
        link = normalize_zigbang_inquiry_link(link_event[2] or '')
        if not link:
            continue
        candidates.append([
            listing_event[1],
            location,
            transaction,
            f'• 문의링크 {link}',
        ])
    return candidates[0] if len(candidates) == 1 else []


def build_public_receipt_payload(item: dict, *, allow_historical: bool = False) -> dict | None:
    key = item.get('key')
    details = item.get('detail_lines')
    if (
        item.get('platform') != '직방'
        or not isinstance(key, str)
        or not re.fullmatch(r'[0-9a-f]{64}', key)
        or not isinstance(details, list)
    ):
        return None
    listing_number = ''
    transaction_type = ''
    for line in details:
        value = str(line)
        listing_match = re.fullmatch(r'• 등록번호 ([0-9]{5,20})', value)
        if listing_match:
            listing_number = listing_match.group(1)
            continue
        transaction_match = re.fullmatch(
            r'• (전세|매매) [0-9]{1,9}|• (월세) [0-9]{1,9}/[0-9]{1,9}',
            value,
        )
        if transaction_match:
            transaction_type = transaction_match.group(1) or transaction_match.group(2)
    if not listing_number or not transaction_type:
        return None
    try:
        raw_received = str(item.get('received_at') or '')
        try:
            received = datetime.fromisoformat(raw_received)
        except ValueError:
            received = parsedate_to_datetime(raw_received)
        if received.tzinfo is None:
            return None
        received_hour = received.astimezone(ZoneInfo('Asia/Seoul')).replace(
            minute=0,
            second=0,
            microsecond=0,
        )
        now_utc = _utc_now()
        received_utc = received.astimezone(timezone.utc)
        if received_utc > now_utc + timedelta(minutes=5):
            return None
        if received_utc < now_utc - timedelta(days=30) and not allow_historical:
            return None
    except (TypeError, ValueError, OverflowError):
        return None
    return {
        'source': 'zigbang',
        'listing_number': listing_number,
        'transaction_type': transaction_type,
        'received_hour': received_hour.isoformat(),
        'status': 'received',
        'source_message_hash': key,
    }


def send_kakao_owner_alert(
    values: dict[str, str],
    alert: str,
    *,
    inquiry_link: str | None = None,
    opener=urlopen,
) -> dict[str, str]:
    client_id = values.get('LOTTEREAL_KAKAO_REST_API_KEY', '')
    client_secret = (
        values.get('LOTTEREAL_KAKAO_CLIENT_SECRET', '')
        or values.get('LOTTEREAL_KAKAO_CLIENT_Login_SECRET', '')
    )
    refresh_token = values.get('LOTTEREAL_KAKAO_REFRESH_TOKEN', '')
    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError('kakao credentials unavailable')
    refresh_request = Request(
        'https://kauth.kakao.com/oauth/token',
        data=urlencode({
            'grant_type': 'refresh_token',
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
        }).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'},
    )
    with opener(refresh_request, timeout=20) as response:
        token = json.load(response)
    access_token = token.get('access_token', '')
    if not access_token:
        raise RuntimeError('kakao token refresh failed')
    safe_link = build_kakao_inquiry_button_link(inquiry_link or '')
    destination = safe_link or 'https://lottes.co.kr/'
    template = {
        'object_type': 'text',
        'text': alert,
        'link': {
            'web_url': destination,
            'mobile_web_url': destination,
        },
        'button_title': '직방 문의 바로보기' if safe_link else '롯데부동산 열기',
    }
    send_request = Request(
        'https://kapi.kakao.com/v2/api/talk/memo/default/send',
        data=urlencode({
            'template_object': json.dumps(template, ensure_ascii=False),
        }).encode(),
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
    )
    with opener(send_request, timeout=20) as response:
        result = json.load(response)
    if result.get('result_code') != 0:
        raise RuntimeError('kakao message rejected')
    updates = {
        'LOTTEREAL_KAKAO_ACCESS_TOKEN': access_token,
        'LOTTEREAL_KAKAO_ACCESS_EXPIRES_IN': str(token.get('expires_in', '')),
        'LOTTEREAL_KAKAO_TOKEN_OBTAINED_AT': str(int(time.time())),
    }
    if token.get('refresh_token'):
        updates['LOTTEREAL_KAKAO_REFRESH_TOKEN'] = str(token['refresh_token'])
    if token.get('refresh_token_expires_in'):
        updates['LOTTEREAL_KAKAO_REFRESH_EXPIRES_IN'] = str(token['refresh_token_expires_in'])
    return updates


def publish_public_receipt(
    values: dict[str, str],
    payload: dict,
    *,
    opener=urlopen,
) -> None:
    allowed_keys = {
        'source',
        'listing_number',
        'transaction_type',
        'received_hour',
        'status',
        'source_message_hash',
    }
    try:
        received = datetime.fromisoformat(str(payload['received_hour']))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError('invalid public receipt payload') from error
    now_utc = _utc_now()
    received_utc = received.astimezone(timezone.utc) if received.tzinfo else None
    if (
        set(payload) != allowed_keys
        or payload.get('source') != 'zigbang'
        or payload.get('status') != 'received'
        or payload.get('transaction_type') not in {'전세', '월세', '매매'}
        or not re.fullmatch(r'[0-9]{5,20}', str(payload.get('listing_number') or ''))
        or not re.fullmatch(r'[0-9a-f]{64}', str(payload.get('source_message_hash') or ''))
        or received_utc is None
        or received.minute != 0
        or received.second != 0
        or received.microsecond != 0
        or received_utc > now_utc + timedelta(minutes=5)
        or received_utc < now_utc - timedelta(days=30)
    ):
        raise ValueError('invalid public receipt payload')
    base_url = values.get('SUPABASE_URL', '').rstrip('/')
    parsed_base = urlparse(base_url)
    secret_key = (
        values.get('SUPABASE_SECRET_KEY', '')
        or values.get('SUPABASE_SERVICE_ROLE_KEY', '')
    )
    if (
        parsed_base.scheme != 'https'
        or not parsed_base.hostname
        or not re.fullmatch(r'[a-z0-9-]+\.supabase\.co', parsed_base.hostname)
        or parsed_base.path not in ('', '/')
        or parsed_base.params
        or parsed_base.query
        or parsed_base.fragment
        or not secret_key
    ):
        raise RuntimeError('supabase server credentials unavailable')
    request = Request(
        f'{base_url}/rest/v1/external_inquiry_receipts?on_conflict=source_message_hash',
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        method='POST',
        headers={
            'apikey': secret_key,
            'Authorization': f'Bearer {secret_key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
            'User-Agent': 'Hermes-LotteReal-Gmail-Watcher',
        },
    )
    with opener(request, timeout=20) as response:
        if not 200 <= response.status < 300:
            raise RuntimeError('public receipt upsert failed')


def update_private_env(path: Path, updates: dict[str, str]) -> None:
    for key, value in updates.items():
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or '\n' in value or '\r' in value:
            raise ValueError('invalid environment update')
    existing = path.read_text(encoding='utf-8')
    remaining = dict(updates)
    output: list[str] = []
    for line in existing.splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key = line.split('=', 1)[0].strip()
            if key in remaining:
                output.append(f'{key}={remaining.pop(key)}')
                continue
        output.append(line)
    if output and output[-1] != '':
        output.append('')
    output.extend(f'{key}={value}' for key, value in remaining.items())
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    temporary.write_text('\n'.join(output).rstrip() + '\n', encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def _format_manwon(value: int) -> str:
    billions, remainder = divmod(value, 10_000)
    if billions and remainder:
        return f'{billions}억 {remainder:,}만원'
    if billions:
        return f'{billions}억원'
    return f'{value:,}만원'


def _format_transaction(line: str) -> str | None:
    sale = re.fullmatch(r'• (전세|매매) ([0-9]{1,9})', line)
    if sale:
        return f'{sale.group(1)} {_format_manwon(int(sale.group(2)))}'
    rent = re.fullmatch(r'• 월세 ([0-9]{1,9})/([0-9]{1,9})', line)
    if rent:
        return f'월세 보증금 {_format_manwon(int(rent.group(1)))} · 월 {int(rent.group(2)):,}만원'
    return None


def build_alert(items: list[dict]) -> str:
    count = len(items)
    if count == 1:
        item = items[0]
        title = item.get('title')
        detail_lines = item.get('detail_lines')
        if title == ZIGBANG_SUBJECT and isinstance(detail_lines, list):
            listing_number = ''
            location = ''
            transaction = ''
            for raw_line in detail_lines:
                if not isinstance(raw_line, str) or len(raw_line) > 120:
                    continue
                listing_match = re.fullmatch(r'• 등록번호 ([0-9]{5,20})', raw_line)
                if listing_match:
                    listing_number = listing_match.group(1)
                    continue
                normalized_location = _normalize_zigbang_location_line(raw_line)
                if normalized_location:
                    location_match = re.fullmatch(
                        r'• (송파구 [가-힣]{1,10}), ((?:[1-9][0-9]?층|반지하층)), '
                        r'(오픈형 원룸|분리형 원룸|투룸|쓰리룸\+)',
                        normalized_location,
                    )
                    if location_match:
                        location = ' · '.join(location_match.groups())
                    continue
                formatted = _format_transaction(raw_line)
                if formatted:
                    transaction = formatted
            details = []
            if listing_number:
                details.append(f'매물번호 {listing_number}')
            if location:
                details.append(location)
            if transaction:
                details.append(transaction)
            body = '\n'.join(details) if details else '매물 상세는 Gmail에서 확인'
            return (
                '📨 직방 새 고객 문의\n'
                f'제목: {ZIGBANG_SUBJECT}\n'
                f'{body}\n'
                '고객 연락처: 아래 버튼에서 확인'
            )
    platforms = {item.get('platform') for item in items if item.get('platform') == '직방'}
    platform = '직방' if platforms == {'직방'} else '매물 플랫폼'
    return f'📨 {platform} 새 고객 문의 {count}건\nGmail에서 문의 내용을 확인하세요.'


def _is_safe_detail_line(line: object) -> bool:
    if not isinstance(line, str) or len(line) > 160:
        return False
    return bool(
        re.fullmatch(r'• 등록번호 [0-9]{5,20}', line)
        or _normalize_zigbang_location_line(line)
        or _normalize_zigbang_transaction_line(line)
        or (
            line.startswith('• 문의링크 ')
            and normalize_zigbang_inquiry_link(line.removeprefix('• 문의링크 '))
        )
    )


def load_state(path: Path) -> dict:
    if not path.exists():
        return {
            'initialized': False,
            'seen_keys': [],
            'fallback_keys': [],
            'parse_failures': {},
            'dead_keys': [],
        }
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        queue_version = payload.get('queue_version') if isinstance(payload, dict) else None
        if queue_version not in (None, 2) or (
            isinstance(payload, dict) and 'pending' in payload and queue_version != 2
        ):
            raise UnsupportedQueueVersion('unsupported inquiry queue state version')
        keys = payload.get('seen_keys') if isinstance(payload, dict) else None
        fallback_keys = payload.get('fallback_keys', []) if isinstance(payload, dict) else None
        fallback_last_warned = payload.get('fallback_last_warned_at', {}) if isinstance(payload, dict) else None
        parse_failures = payload.get('parse_failures', {}) if isinstance(payload, dict) else None
        dead_keys = payload.get('dead_keys', []) if isinstance(payload, dict) else None
        initialized = payload.get('initialized') if isinstance(payload, dict) else None
        if (
            initialized is not True
            or not isinstance(keys, list)
            or not isinstance(fallback_keys, list)
            or not isinstance(fallback_last_warned, dict)
            or not isinstance(parse_failures, dict)
            or not isinstance(dead_keys, list)
        ):
            raise ValueError('invalid state')
        if not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in keys):
            raise ValueError('invalid state key')
        if not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in fallback_keys):
            raise ValueError('invalid fallback key')
        if not all(
            isinstance(key, str)
            and re.fullmatch(r'[0-9a-f]{64}', key)
            and _parse_timestamp(value) is not None
            for key, value in fallback_last_warned.items()
        ):
            raise ValueError('invalid fallback warning time')
        if not all(
            isinstance(key, str)
            and re.fullmatch(r'[0-9a-f]{64}', key)
            and isinstance(count, int)
            and 1 <= count <= 2
            for key, count in parse_failures.items()
        ):
            raise ValueError('invalid parse failure')
        if not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in dead_keys):
            raise ValueError('invalid dead key')
        pending = payload.get('pending', {})
        if payload.get('queue_version') == 2:
            allowed_errors = {
                None, 'detail_fetch', 'parse_invalid', 'receipt_publish',
                'kakao_transport', 'kakao_ambiguous',
            }
            allowed_statuses = {'pending', 'dispatching', 'accepted', 'ambiguous'}
            if not isinstance(pending, dict):
                raise ValueError('invalid pending queue')
            for pending_key, item in pending.items():
                if (
                    not isinstance(pending_key, str)
                    or not re.fullmatch(r'[0-9a-f]{64}', pending_key)
                    or not isinstance(item, dict)
                    or item.get('key') != pending_key
                    or item.get('platform') != '직방'
                    or item.get('title') != ZIGBANG_SUBJECT
                    or not re.fullmatch(r'\d{1,20}', str(item.get('uid') or ''))
                    or item.get('status') not in allowed_statuses
                    or not isinstance(item.get('attempt_count'), int)
                    or isinstance(item.get('attempt_count'), bool)
                    or not 0 <= item['attempt_count'] <= 100_000
                    or item.get('last_error') not in allowed_errors
                    or _parse_timestamp(item.get('received_at')) is None
                    or _parse_timestamp(item.get('discovered_at')) is None
                    or _parse_timestamp(item.get('next_retry_at')) is None
                    or (
                        item.get('first_failed_at') is not None
                        and _parse_timestamp(item.get('first_failed_at')) is None
                    )
                    or not isinstance(item.get('detail_lines'), list)
                    or not all(_is_safe_detail_line(line) for line in item['detail_lines'])
                ):
                    raise ValueError('invalid pending item')
        result = {
            'initialized': True,
            'seen_keys': list(dict.fromkeys(keys)),
            'fallback_keys': list(dict.fromkeys(fallback_keys)),
            'parse_failures': dict(parse_failures),
            'dead_keys': list(dict.fromkeys(dead_keys)),
        }
        migrated = False
        if payload.get('queue_version') == 2 and isinstance(payload.get('pending'), dict):
            sanitized_pending = {}
            for key, item in payload['pending'].items():
                sanitized = dict(item)
                safe_lines = _queue_safe_detail_lines(item['detail_lines'])
                if safe_lines != item['detail_lines']:
                    migrated = True
                sanitized['detail_lines'] = safe_lines
                sanitized_pending[key] = sanitized
            result.update({'queue_version': 2, 'pending': sanitized_pending})
        if fallback_last_warned:
            result['fallback_last_warned_at'] = dict(fallback_last_warned)
        if payload.get('queue_version') == 2 and migrated:
            write_state(path, result)
        return result
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        quarantine = path.with_name(path.name + '.corrupt')
        suffix = 1
        while quarantine.exists():
            quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
            suffix += 1
        os.chmod(path, 0o600)
        os.replace(path, quarantine)
        return {
            'initialized': False,
            'seen_keys': [],
            'fallback_keys': [],
            'parse_failures': {},
            'dead_keys': [],
        }


def write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    with temporary.open('w', encoding='utf-8') as output:
        json.dump(state, output, ensure_ascii=False, sort_keys=True)
        output.flush()
        os.fchmod(output.fileno(), 0o600)
        os.fsync(output.fileno())
    os.replace(temporary, path)
    directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def write_heartbeat(
    path: Path,
    *,
    success: bool = True,
    now: datetime | None = None,
    pending_alerts: int | None = None,
    oldest_pending_at: str | None = None,
    pending_errors: dict[str, int] | None = None,
    delivered: bool = False,
) -> None:
    instant = now or _utc_now()
    if instant.tzinfo is None:
        raise ValueError('heartbeat time must be timezone-aware')
    timestamp = instant.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    payload: dict[str, object] = {'last_attempt_at': timestamp}
    if success:
        payload['last_success_at'] = timestamp
    if delivered:
        payload['last_delivered_at'] = timestamp
    if pending_alerts is not None:
        payload['pending_alerts'] = pending_alerts
        if pending_alerts > 0 and oldest_pending_at:
            payload['oldest_pending_at'] = oldest_pending_at
    if pending_errors is not None:
        payload['pending_errors'] = pending_errors
    if path.exists():
        # Fields this write does not decide are carried over, so the watchdog can tell
        # "running" from "delivering" (lottereal_inquiry_anomaly_watch.py).
        try:
            previous = json.loads(path.read_text(encoding='utf-8'))
            for field in ('last_success_at', 'last_delivered_at'):
                value = previous.get(field)
                if field in payload or not isinstance(value, str):
                    continue
                if datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None:
                    payload[field] = value
            previous_pending = previous.get('pending_alerts')
            if (
                'pending_alerts' not in payload
                and isinstance(previous_pending, int)
                and not isinstance(previous_pending, bool)
                and previous_pending >= 0
            ):
                payload['pending_alerts'] = previous_pending
                previous_oldest = previous.get('oldest_pending_at')
                if previous_pending > 0 and isinstance(previous_oldest, str):
                    parsed_oldest = datetime.fromisoformat(previous_oldest.replace('Z', '+00:00'))
                    if parsed_oldest.tzinfo is not None:
                        payload['oldest_pending_at'] = previous_oldest
        except (OSError, AttributeError, json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError):
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    temporary.write_text(
        json.dumps(payload, sort_keys=True),
        encoding='utf-8',
    )
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def build_discord_fallback(items: list[dict]) -> str:
    errors = {item.get('last_error') for item in items}
    if len(items) == 1:
        summary = build_alert(items).replace(
            '고객 연락처: 아래 버튼에서 확인',
            '고객 연락처: Gmail에서 확인',
        )
        if '매물번호 ' in summary:
            if errors == {'kakao_ambiguous'}:
                prefix = '⚠️ 카카오 전송 결과 수동 확인—자동 재전송 안 함'
            elif errors == {'receipt_publish'}:
                prefix = '⚠️ 공개 접수 처리 지연—Discord 임시 알림'
            elif errors & {'detail_fetch', 'parse_invalid'}:
                prefix = '⚠️ 문의 상세 처리 지연—Discord 임시 알림'
            else:
                prefix = '⚠️ 카카오 전송 지연—Discord 임시 알림'
            return f'{prefix}\n{summary}'
    if errors == {'kakao_ambiguous'}:
        return (
            f'⚠️ 카카오 전송 결과 수동 확인 {len(items)}건. '
            'Gmail과 카카오 발송 내역을 대조하세요.'
        )
    return f'⚠️ 직방 문의 처리 지연 {len(items)}건. Gmail에서 확인하세요.'


def record_fallback(
    state_path: Path,
    items: list[dict],
    *,
    now: datetime | None = None,
) -> str:
    instant = (now or _utc_now()).astimezone(timezone.utc)
    state = load_state(state_path)
    valid_keys = [
        item.get('key') for item in items
        if isinstance(item.get('key'), str) and re.fullmatch(r'[0-9a-f]{64}', item['key'])
    ]
    warning_times = dict(state.get('fallback_last_warned_at', {}))
    due_keys = []
    for key in valid_keys:
        last_warned = _parse_timestamp(warning_times.get(key))
        if (
            last_warned is None
            or instant - last_warned >= FALLBACK_WARNING_COOLDOWN
            or instant < last_warned
        ):
            due_keys.append(key)
            warning_times[key] = _timestamp(instant)
    merged_fallbacks = list(dict.fromkeys(state['fallback_keys'] + valid_keys))[-500:]
    retained = set(merged_fallbacks)
    write_state(state_path, {
        **state,
        'initialized': True,
        'fallback_keys': merged_fallbacks,
        'fallback_last_warned_at': {
            key: value for key, value in warning_times.items() if key in retained
        },
    })
    if not due_keys:
        return ''
    due = set(due_keys)
    due_items = [item for item in items if item.get('key') in due]
    return build_discord_fallback(due_items)


def record_parse_failure(state_path: Path, item: dict) -> str:
    key = item.get('key')
    if not isinstance(key, str) or not re.fullmatch(r'[0-9a-f]{64}', key):
        return ''
    state = load_state(state_path)
    count = state['parse_failures'].get(key, 0) + 1
    parse_failures = dict(state['parse_failures'])
    dead_keys = list(state['dead_keys'])
    terminal = count >= 3
    if terminal:
        parse_failures.pop(key, None)
        dead_keys = list(dict.fromkeys(dead_keys + [key]))[-500:]
    else:
        parse_failures[key] = count
    first_fallback = key not in state['fallback_keys']
    fallback_keys = list(dict.fromkeys(state['fallback_keys'] + [key]))[-500:]
    write_state(state_path, {
        **state,
        'initialized': True,
        'fallback_keys': fallback_keys,
        'parse_failures': parse_failures,
        'dead_keys': dead_keys,
    })
    if terminal:
        return '⚠️ 직방 문의 자동 처리 제외 1건. Gmail에서 확인하세요.'
    if first_fallback:
        return '⚠️ 직방 문의 처리 지연 1건. Gmail에서 확인하세요.'
    return ''


def mark_delivered(state_path: Path, key: str) -> None:
    if not re.fullmatch(r'[0-9a-f]{64}', key):
        raise ValueError('invalid delivered key')
    state = load_state(state_path)
    parse_failures = dict(state['parse_failures'])
    parse_failures.pop(key, None)
    pending = dict(state.get('pending', {}))
    pending.pop(key, None)
    write_state(state_path, {
        **state,
        'initialized': True,
        'seen_keys': list(dict.fromkeys(state['seen_keys'] + [key]))[-500:],
        'fallback_keys': [value for value in state['fallback_keys'] if value != key],
        'fallback_last_warned_at': {
            value: warned
            for value, warned in state.get('fallback_last_warned_at', {}).items()
            if value != key
        },
        'parse_failures': parse_failures,
        'dead_keys': [value for value in state['dead_keys'] if value != key],
        **({'queue_version': 2, 'pending': pending} if 'pending' in state else {}),
    })


def _timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else None
    except (ValueError, OverflowError):
        return None


def _save_pending(state_path: Path, state: dict, pending: dict[str, dict]) -> None:
    write_state(state_path, {**state, 'queue_version': 2, 'pending': pending})


def reconcile_legacy_pending(state_path: Path, legacy_keys: set[str]) -> int:
    """Quarantine exact pre-v2 outcomes using keys from a protected snapshot."""
    if not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in legacy_keys):
        raise ValueError('invalid legacy fallback key')
    state = load_state(state_path)
    if state.get('queue_version') != 2:
        raise UnsupportedQueueVersion('queue v2 is required for reconciliation')
    pending = dict(state.get('pending', {}))
    changed = 0
    for key in legacy_keys:
        current = pending.get(key)
        if not isinstance(current, dict) or current.get('status') != 'pending':
            continue
        item = dict(current)
        item.update({'status': 'ambiguous', 'last_error': 'kakao_ambiguous'})
        pending[key] = item
        changed += 1
    if changed:
        _save_pending(state_path, state, pending)
    return changed


def _queue_safe_detail_lines(lines: list[str]) -> list[str]:
    return [
        line for line in lines
        if _is_safe_detail_line(line) and not line.startswith('• 문의링크 ')
    ]


def enqueue_pending(state_path: Path, items: list[dict], *, now: datetime | None = None) -> dict:
    """Durably capture privacy-safe delivery work before attempting transports."""
    instant = now or _utc_now()
    state = load_state(state_path)
    pending = dict(state.get('pending', {}))
    excluded = set(state['seen_keys']) | set(state['dead_keys'])
    legacy_state = state.get('queue_version') != 2
    changed = 'pending' not in state
    for item in items:
        key = item.get('key')
        if (
            not isinstance(key, str)
            or not re.fullmatch(r'[0-9a-f]{64}', key)
            or key in excluded
            or key in pending
        ):
            continue
        received_at = str(item.get('received_at') or '')
        if _parse_timestamp(received_at) is None:
            received_at = _timestamp(instant)
        is_retry = key in set(state['fallback_keys'])
        requires_reconciliation = is_retry and legacy_state
        pending[key] = {
            'key': key,
            'platform': '직방',
            'received_at': received_at,
            'title': ZIGBANG_SUBJECT,
            'uid': str(item.get('uid') or ''),
            'detail_lines': [],
            'status': 'ambiguous' if requires_reconciliation else 'pending',
            'discovered_at': _timestamp(instant),
            'first_failed_at': _timestamp(instant) if is_retry else None,
            'attempt_count': 1 if is_retry else 0,
            'next_retry_at': _timestamp(instant),
            'last_error': (
                'kakao_ambiguous' if requires_reconciliation
                else 'kakao_transport' if is_retry
                else None
            ),
        }
        changed = True
    if changed:
        _save_pending(state_path, state, pending)
    return load_state(state_path)


def _record_delivery_failure(
    state_path: Path,
    key: str,
    error_code: str,
    *,
    now: datetime | None = None,
    detail_lines: list[str] | None = None,
) -> None:
    instant = now or _utc_now()
    state = load_state(state_path)
    pending = dict(state.get('pending', {}))
    item = dict(pending[key])
    attempts = int(item.get('attempt_count', 0)) + 1
    delay_seconds = min(int(MAX_RETRY_DELAY.total_seconds()), 60 * (2 ** min(attempts - 1, 16)))
    item.update({
        'status': 'pending',
        'first_failed_at': item.get('first_failed_at') or _timestamp(instant),
        'attempt_count': attempts,
        'next_retry_at': _timestamp(instant + timedelta(seconds=delay_seconds)),
        'last_error': error_code,
    })
    if detail_lines is not None:
        item['detail_lines'] = _queue_safe_detail_lines(detail_lines)
    pending[key] = item
    _save_pending(state_path, state, pending)


def _record_ambiguous_dispatch(
    state_path: Path,
    key: str,
    *,
    now: datetime | None = None,
    detail_lines: list[str] | None = None,
) -> None:
    instant = now or _utc_now()
    state = load_state(state_path)
    pending = dict(state.get('pending', {}))
    item = dict(pending[key])
    item.update({
        'status': 'ambiguous',
        'first_failed_at': item.get('first_failed_at') or _timestamp(instant),
        'last_error': 'kakao_ambiguous',
    })
    if detail_lines is not None:
        item['detail_lines'] = _queue_safe_detail_lines(detail_lines)
    pending[key] = item
    _save_pending(state_path, state, pending)


def select_pending(state: dict, *, now: datetime | None = None) -> list[dict]:
    """Reserve capacity for both first attempts and due retries, borrowing spare slots."""
    instant = (now or _utc_now()).astimezone(timezone.utc)
    candidates = [
        item for item in state.get('pending', {}).values()
        if item.get('status') == 'pending'
        and (_parse_timestamp(item.get('next_retry_at')) or instant) <= instant
    ]
    fresh = sorted(
        (item for item in candidates if item.get('attempt_count') == 0),
        key=lambda item: (item.get('discovered_at', ''), item['key']),
    )
    retries = sorted(
        (item for item in candidates if item.get('attempt_count', 0) > 0),
        key=lambda item: (item.get('next_retry_at', ''), item.get('discovered_at', ''), item['key']),
    )
    if fresh and retries:
        selected = fresh[:MAX_DELIVERY_BATCH - RETRY_RESERVE] + retries[:RETRY_RESERVE]
        if len(selected) < MAX_DELIVERY_BATCH:
            used = {item['key'] for item in selected}
            selected.extend(item for item in fresh + retries if item['key'] not in used)
    else:
        selected = fresh + retries
    return selected[:MAX_DELIVERY_BATCH]


def _pending_metrics(state: dict) -> tuple[int, str | None, dict[str, int]]:
    pending = list(state.get('pending', {}).values())
    if not pending:
        return 0, None, {}
    instants = [
        parsed for parsed in (_parse_timestamp(item.get('discovered_at')) for item in pending)
        if parsed is not None
    ]
    errors: dict[str, int] = {}
    for item in pending:
        error = item.get('last_error')
        if isinstance(error, str):
            errors[error] = errors.get(error, 0) + 1
    return len(pending), _timestamp(min(instants)) if instants else None, errors


def process_items(items: list[dict], state_path: Path) -> str:
    state = load_state(state_path)
    valid_items = [
        item for item in items
        if isinstance(item.get('key'), str) and re.fullmatch(r'[0-9a-f]{64}', item['key'])
    ]
    current_keys = list(dict.fromkeys(item['key'] for item in valid_items))
    if not state['initialized']:
        write_state(state_path, {
            'initialized': True,
            'seen_keys': current_keys[-500:],
            'fallback_keys': [],
            'parse_failures': {},
            'dead_keys': [],
        })
        return ''
    seen = set(state['seen_keys'])
    unseen = [item for item in valid_items if item['key'] not in seen]
    merged = list(dict.fromkeys(state['seen_keys'] + current_keys))[-500:]
    remaining_fallbacks = [key for key in state['fallback_keys'] if key not in merged]
    write_state(state_path, {
        **state,
        'initialized': True,
        'seen_keys': merged,
        'fallback_keys': remaining_fallbacks,
    })
    return build_alert(unseen) if unseen else ''


def load_private_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> int:
    env_path = Path(os.environ.get('LOTTEREAL_ENV_PATH', DEFAULT_ENV_PATH))
    state_path = Path(os.environ.get('LOTTEREAL_GMAIL_WATCH_STATE', DEFAULT_STATE_PATH))
    heartbeat_path = Path(os.environ.get('LOTTEREAL_GMAIL_WATCH_HEARTBEAT', DEFAULT_HEARTBEAT_PATH))
    values = load_private_env(env_path)
    address = values.get('LOTTEREAL_GMAIL_ADDRESS', '')
    password = values.get('LOTTEREAL_GMAIL_APP_PASSWORD', '')
    if not address or not password:
        raise RuntimeError('gmail credentials unavailable')

    lock_path = state_path.with_suffix(state_path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        write_heartbeat(heartbeat_path, success=False)
        try:
            items = fetch_verified_messages(address, password)
        except (OSError, imaplib.IMAP4.abort):
            time.sleep(2)
            try:
                items = fetch_verified_messages(address, password)
            except (OSError, imaplib.IMAP4.abort):
                return 0
        state = load_state(state_path)
        if not state['initialized']:
            process_items(items, state_path)
            write_heartbeat(heartbeat_path)
            return 0
        state = enqueue_pending(state_path, items)
        accepted_keys = [
            key for key, queued in state.get('pending', {}).items()
            if queued.get('status') == 'accepted'
        ]
        for key in accepted_keys:
            mark_delivered(state_path, key)
        state = load_state(state_path)
        selected = select_pending(state)

        delayed: list[dict] = []
        delivered_any = bool(accepted_keys)
        for queued in selected:
            item = dict(queued)
            try:
                item['detail_lines'] = fetch_zigbang_detail(
                    address,
                    password,
                    str(item.get('uid') or ''),
                )
            except Exception:
                _record_delivery_failure(state_path, item['key'], 'detail_fetch')
                delayed.append(item)
                continue
            delivery_receipt = build_public_receipt_payload(item, allow_historical=True)
            if delivery_receipt is None:
                _record_delivery_failure(
                    state_path, item['key'], 'parse_invalid', detail_lines=item['detail_lines']
                )
                delayed.append(item)
                continue
            receipt = build_public_receipt_payload(item)

            if receipt is not None:
                try:
                    publish_public_receipt(values, receipt)
                except Exception:
                    _record_delivery_failure(
                        state_path, item['key'], 'receipt_publish', detail_lines=item['detail_lines']
                    )
                    delayed.append(item)
                    continue

            alert = build_alert([item])
            inquiry_link = extract_zigbang_inquiry_link(item['detail_lines'])
            dispatch_state = load_state(state_path)
            dispatch_pending = dict(dispatch_state.get('pending', {}))
            dispatch_item = dict(dispatch_pending[item['key']])
            dispatch_item.update({
                'detail_lines': _queue_safe_detail_lines(item['detail_lines']),
                'status': 'dispatching',
                'dispatch_started_at': _timestamp(_utc_now()),
                'delivery_key': item['key'],
            })
            dispatch_pending[item['key']] = dispatch_item
            _save_pending(state_path, dispatch_state, dispatch_pending)
            try:
                token_updates = send_kakao_owner_alert(
                    values,
                    alert,
                    inquiry_link=inquiry_link,
                )
            except Exception:
                _record_ambiguous_dispatch(
                    state_path, item['key'], detail_lines=item['detail_lines']
                )
                delayed.append(item)
                continue

            accepted_state = load_state(state_path)
            accepted_pending = dict(accepted_state.get('pending', {}))
            accepted_item = dict(accepted_pending[item['key']])
            accepted_item.update({'status': 'accepted', 'accepted_at': _timestamp(_utc_now())})
            accepted_pending[item['key']] = accepted_item
            _save_pending(state_path, accepted_state, accepted_pending)
            try:
                update_private_env(env_path, token_updates)
                values.update(token_updates)
            except Exception:
                pass

            mark_delivered(state_path, item['key'])
            delivered_any = True
        unresolved = [
            queued for queued in load_state(state_path).get('pending', {}).values()
            if queued.get('last_error') is not None
        ]
        if unresolved:
            # One message per run: warnings repeat only on the bounded cooldown.
            fallback = record_fallback(state_path, unresolved)
            if fallback:
                print(fallback, flush=True)
        pending, oldest, pending_errors = _pending_metrics(load_state(state_path))
        write_heartbeat(
            heartbeat_path,
            pending_alerts=pending,
            oldest_pending_at=oldest,
            pending_errors=pending_errors,
            delivered=delivered_any,
        )
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Gmail inquiry watcher failed.', file=sys.stderr)
        raise SystemExit(1) from None
