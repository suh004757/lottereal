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
from zoneinfo import ZoneInfo

ZIGBANG_SENDER = 'cs@zigbang.com'
ZIGBANG_SUBJECT = '직방에서 고객 문의가 들어왔습니다.'
DEFAULT_ENV_PATH = Path('/opt/data/.env')
DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal/gmail-inquiry-watch.json')


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

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def parse_zigbang_detail(html_body: str) -> list[str]:
    parser = _HtmlText()
    parser.feed(str(html_body or '')[:250_000])
    lines = [' '.join(unescape(part).split()) for part in parser.parts]
    lines = [line for line in lines if line]
    try:
        start = next(index for index, line in enumerate(lines) if line == '[매물정보]') + 1
    except StopIteration:
        return []
    safe: list[str] = []
    listing_seen = False
    transaction_seen = False
    for line in lines[start:start + 20]:
        if '연락처 확인' in line:
            break
        if not listing_seen and re.fullmatch(r'• 등록번호 [0-9]{5,20}', line):
            safe.append(line)
            listing_seen = True
            continue
        if (
            listing_seen
            and not transaction_seen
            and re.fullmatch(r'• (?:전세|매매) [0-9]{1,9}|• 월세 [0-9]{1,9}/[0-9]{1,9}', line)
        ):
            safe.append(line)
            transaction_seen = True
    return safe if listing_seen else []


def build_public_receipt_payload(item: dict) -> dict | None:
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
    for line in details:
        match = re.fullmatch(r'• 등록번호 ([0-9]{5,20})', str(line))
        if match:
            listing_number = match.group(1)
            break
    if not listing_number:
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
        now_utc = datetime.now(timezone.utc)
        received_utc = received.astimezone(timezone.utc)
        if received_utc > now_utc + timedelta(minutes=5):
            return None
        if received_utc < now_utc - timedelta(days=30):
            return None
    except (TypeError, ValueError, OverflowError):
        return None
    return {
        'source': 'zigbang',
        'listing_number': listing_number,
        'received_hour': received_hour.isoformat(),
        'status': 'received',
        'source_message_hash': key,
    }


def send_kakao_owner_alert(
    values: dict[str, str],
    alert: str,
    *,
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
    template = {
        'object_type': 'text',
        'text': alert,
        'link': {
            'web_url': 'https://mail.google.com',
            'mobile_web_url': 'https://mail.google.com',
        },
        'button_title': 'Gmail에서 확인',
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
        'received_hour',
        'status',
        'source_message_hash',
    }
    try:
        received = datetime.fromisoformat(str(payload['received_hour']))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError('invalid public receipt payload') from error
    now_utc = datetime.now(timezone.utc)
    received_utc = received.astimezone(timezone.utc) if received.tzinfo else None
    if (
        set(payload) != allowed_keys
        or payload.get('source') != 'zigbang'
        or payload.get('status') != 'received'
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


def build_alert(items: list[dict]) -> str:
    count = len(items)
    if count == 1:
        item = items[0]
        title = item.get('title')
        detail_lines = item.get('detail_lines')
        if title == ZIGBANG_SUBJECT and isinstance(detail_lines, list):
            details = [
                line for line in detail_lines[:3]
                if isinstance(line, str)
                and len(line) <= 80
                and re.fullmatch(
                    r'• 등록번호 [0-9]{5,20}|• (?:전세|매매) [0-9]{1,9}|• 월세 [0-9]{1,9}/[0-9]{1,9}',
                    line,
                )
            ]
            body = '\n'.join(details) if details else '• 매물 상세는 Gmail에서 확인'
            return (
                '📨 직방 새 고객 문의\n'
                f'제목: {ZIGBANG_SUBJECT}\n'
                f'내용:\n{body}\n'
                '연락처: Gmail에서 확인'
            )
    platforms = {item.get('platform') for item in items if item.get('platform') == '직방'}
    platform = '직방' if platforms == {'직방'} else '매물 플랫폼'
    return f'📨 {platform} 새 고객 문의 {count}건\nGmail에서 문의 내용을 확인하세요.'


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
        keys = payload.get('seen_keys') if isinstance(payload, dict) else None
        fallback_keys = payload.get('fallback_keys', []) if isinstance(payload, dict) else None
        parse_failures = payload.get('parse_failures', {}) if isinstance(payload, dict) else None
        dead_keys = payload.get('dead_keys', []) if isinstance(payload, dict) else None
        initialized = payload.get('initialized') if isinstance(payload, dict) else None
        if (
            initialized is not True
            or not isinstance(keys, list)
            or not isinstance(fallback_keys, list)
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
            and isinstance(count, int)
            and 1 <= count <= 2
            for key, count in parse_failures.items()
        ):
            raise ValueError('invalid parse failure')
        if not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in dead_keys):
            raise ValueError('invalid dead key')
        return {
            'initialized': True,
            'seen_keys': list(dict.fromkeys(keys)),
            'fallback_keys': list(dict.fromkeys(fallback_keys)),
            'parse_failures': dict(parse_failures),
            'dead_keys': list(dict.fromkeys(dead_keys)),
        }
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        quarantine = path.with_name(path.name + '.corrupt')
        suffix = 1
        while quarantine.exists():
            quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
            suffix += 1
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
    temporary.write_text(
        json.dumps(state, ensure_ascii=False, sort_keys=True),
        encoding='utf-8',
    )
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def record_fallback(state_path: Path, items: list[dict]) -> str:
    state = load_state(state_path)
    valid_keys = [
        item.get('key') for item in items
        if isinstance(item.get('key'), str) and re.fullmatch(r'[0-9a-f]{64}', item['key'])
    ]
    previous = set(state['fallback_keys'])
    new_keys = [key for key in valid_keys if key not in previous]
    merged_fallbacks = list(dict.fromkeys(state['fallback_keys'] + valid_keys))[-500:]
    write_state(state_path, {
        **state,
        'initialized': True,
        'fallback_keys': merged_fallbacks,
    })
    if not new_keys:
        return ''
    return f'⚠️ 직방 문의 처리 지연 {len(new_keys)}건. Gmail에서 확인하세요.'


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
    write_state(state_path, {
        **state,
        'initialized': True,
        'seen_keys': list(dict.fromkeys(state['seen_keys'] + [key]))[-500:],
        'fallback_keys': [value for value in state['fallback_keys'] if value != key],
        'parse_failures': parse_failures,
        'dead_keys': [value for value in state['dead_keys'] if value != key],
    })


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
    values = load_private_env(env_path)
    address = values.get('LOTTEREAL_GMAIL_ADDRESS', '')
    password = values.get('LOTTEREAL_GMAIL_APP_PASSWORD', '')
    if not address or not password:
        raise RuntimeError('gmail credentials unavailable')

    lock_path = state_path.with_suffix(state_path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        items = fetch_verified_messages(address, password)
        state = load_state(state_path)
        if not state['initialized']:
            process_items(items, state_path)
            return 0
        seen = set(state['seen_keys'])
        dead = set(state['dead_keys'])
        unseen = [
            item for item in items
            if item.get('key') not in seen and item.get('key') not in dead
        ]
        if not unseen:
            return 0

        for item in unseen[:10]:
            try:
                item['detail_lines'] = fetch_zigbang_detail(
                    address,
                    password,
                    str(item.get('uid') or ''),
                )
            except Exception:
                fallback = record_fallback(state_path, [item])
                if fallback:
                    print(fallback, flush=True)
                continue
            receipt = build_public_receipt_payload(item)
            if receipt is None:
                fallback = record_parse_failure(state_path, item)
                if fallback:
                    print(fallback, flush=True)
                continue

            try:
                publish_public_receipt(values, receipt)
            except Exception:
                fallback = record_fallback(state_path, [item])
                if fallback:
                    print(fallback, flush=True)
                continue

            alert = build_alert([item])
            try:
                token_updates = send_kakao_owner_alert(values, alert)
                update_private_env(env_path, token_updates)
                values.update(token_updates)
            except Exception:
                fallback = record_fallback(state_path, [item])
                if fallback:
                    print(fallback, flush=True)
                continue

            mark_delivered(state_path, item['key'])
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Gmail inquiry watcher failed.', file=sys.stderr)
        raise SystemExit(1) from None
