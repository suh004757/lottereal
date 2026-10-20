#!/usr/bin/env python3
"""Deterministic anomaly notifier for the LotteReal Gmail inquiry watcher."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEFAULT_ENV_PATH = Path('/opt/data/.env')
DEFAULT_HEARTBEAT_PATH = Path('/opt/data/state/lottereal/gmail-inquiry-watch-heartbeat.json')
DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal/inquiry-anomaly-watch.json')


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _open_without_redirect(request, *, timeout):
    return build_opener(NoRedirectHandler()).open(request, timeout=timeout)


def probe_supabase(env_path: Path, *, opener=None) -> bool:
    """Return a privacy-safe read-only Supabase availability result."""
    try:
        values: dict[str, str] = {}
        for line in env_path.read_text(encoding='utf-8').splitlines():
            if not line or line.lstrip().startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
        url = values.get('SUPABASE_URL', '').rstrip('/')
        credential = (
            values.get('SUPABASE_SECRET_KEY')
            or values.get('SUPABASE_SERVICE_ROLE_KEY')
            or ''
        )
        parsed = urlparse(url)
        hostname = parsed.hostname or ''
        if (
            parsed.scheme != 'https'
            or not hostname.endswith('.supabase.co')
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port is not None
            or parsed.path not in ('', '/')
            or parsed.query
            or parsed.fragment
            or not credential
        ):
            return False
        canonical_url = f'https://{hostname}'
        request = Request(
            f'{canonical_url}/rest/v1/external_inquiry_receipts?select=id&limit=1',
            method='GET',
            headers={
                'apikey': credential,
                'Authorization': f'Bearer {credential}',
                'Accept': 'application/json',
                'User-Agent': 'Hermes-LotteReal-Health',
            },
        )
        open_request = opener or _open_without_redirect
        with open_request(request, timeout=8) as response:
            response.read(2)
            return response.status == 200
    except Exception:
        return False


def _write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(state, sort_keys=True), encoding='utf-8')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def _quarantine(path: Path) -> None:
    quarantine = path.with_name(path.name + '.corrupt')
    suffix = 1
    while quarantine.exists():
        quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
        suffix += 1
    os.chmod(path, 0o600)
    os.replace(path, quarantine)


def run_once(
    heartbeat_path: Path,
    state_path: Path,
    *,
    now: datetime | None = None,
    supabase_ok: bool | None = None,
    ack_id: str | None = None,
) -> str:
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise ValueError('current time must be timezone-aware')
    if state_path.exists():
        try:
            raw_state = json.loads(state_path.read_text(encoding='utf-8'))
            handoff = raw_state.get('handoff') if isinstance(raw_state, dict) else None
            if handoff is not None:
                if (
                    not isinstance(handoff, dict)
                    or not re.fullmatch(r'[0-9a-f]{64}', str(handoff.get('id') or ''))
                    or not isinstance(handoff.get('message'), str)
                    or not isinstance(handoff.get('next_state'), dict)
                ):
                    raise ValueError('invalid alert handoff')
                if ack_id != handoff['id']:
                    return handoff['message']
                _write_state(state_path, handoff['next_state'])
        except (OSError, json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError):
            _quarantine(state_path)
    recorded = None
    pending_alerts = 0
    oldest_pending = None
    if heartbeat_path.exists():
        try:
            payload = json.loads(heartbeat_path.read_text(encoding='utf-8'))
            raw_pending = payload.get('pending_alerts', 0)
            if isinstance(raw_pending, int) and not isinstance(raw_pending, bool) and raw_pending > 0:
                pending_alerts = raw_pending
            raw_oldest = payload.get('oldest_pending_at')
            if isinstance(raw_oldest, str):
                try:
                    parsed_oldest = datetime.fromisoformat(raw_oldest.replace('Z', '+00:00'))
                    if parsed_oldest.tzinfo is not None:
                        oldest_pending = parsed_oldest
                except ValueError:
                    pass
            raw_recorded = payload.get('last_success_at', payload.get('last_attempt_at'))
            if not isinstance(raw_recorded, str):
                raise ValueError('invalid heartbeat time')
            recorded = datetime.fromisoformat(raw_recorded.replace('Z', '+00:00'))
            if recorded.tzinfo is None:
                raise ValueError('heartbeat time must be timezone-aware')
        except (OSError, json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError, ValueError):
            recorded = None
    previous_stale = False
    delivery_alerted = None
    supabase_failures = 0
    supabase_successes = 0
    supabase_alerted = False
    state_has_supabase = supabase_ok is not None
    previous_state: dict[str, object] = {}
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text(encoding='utf-8'))
            allowed_keys = {
                'stale_alerted',
                'delivery_alerted',
                'supabase_alerted',
                'supabase_failures',
                'supabase_successes',
            }
            if not isinstance(previous, dict) or not set(previous).issubset(allowed_keys):
                raise ValueError('invalid anomaly state')
            if not isinstance(previous.get('stale_alerted'), bool):
                raise ValueError('invalid anomaly state')
            previous_stale = previous['stale_alerted']
            if 'delivery_alerted' in previous:
                if not isinstance(previous['delivery_alerted'], bool):
                    raise ValueError('invalid anomaly state')
                delivery_alerted = previous['delivery_alerted']
            if any(key.startswith('supabase_') for key in previous):
                previous_successes = previous.get('supabase_successes', 0)
                if (
                    not isinstance(previous.get('supabase_alerted'), bool)
                    or not isinstance(previous.get('supabase_failures'), int)
                    or isinstance(previous.get('supabase_failures'), bool)
                    or not 0 <= previous['supabase_failures'] <= 2
                    or not isinstance(previous_successes, int)
                    or isinstance(previous_successes, bool)
                    or not 0 <= previous_successes <= 1
                ):
                    raise ValueError('invalid Supabase anomaly state')
                supabase_alerted = previous['supabase_alerted']
                supabase_failures = previous['supabase_failures']
                supabase_successes = previous_successes
                state_has_supabase = True
            previous_state = dict(previous)
        except (json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError, ValueError):
            _quarantine(state_path)
            state_has_supabase = supabase_ok is not None
            delivery_alerted = None
    age = None if recorded is None else (
        instant.astimezone(timezone.utc) - recorded.astimezone(timezone.utc)
    )
    stale = age is None or age < timedelta(0) or age >= timedelta(minutes=7)
    messages: list[str] = []
    if stale and not previous_stale:
        messages.append(
            '⚠️ LotteReal 문의 알림 점검 필요\n'
            '유형: Gmail watcher 실행 지연\n'
            '마지막 정상 확인: 7분 이상 전\n'
            '고객정보·메일 본문·직방 링크는 포함하지 않았습니다.'
        )
    elif not stale and previous_stale:
        messages.append(
            '✅ LotteReal 문의 watcher 정상 복구\n'
            '현재: 정상 실행 중'
        )

    # A running watcher is not a working one: Kakao can reject every alert while the
    # heartbeat stays fresh (2026-09-30..10-19, KOE322).
    undelivered = pending_alerts > 0 and (
        oldest_pending is None
        or instant.astimezone(timezone.utc) - oldest_pending.astimezone(timezone.utc)
        >= timedelta(hours=6)
    )
    if undelivered and not delivery_alerted:
        messages.append(
            '⚠️ LotteReal 문의 알림 전달 실패\n'
            f'카카오 알림 대기: {pending_alerts}건, 6시간 이상 전달 없음\n'
            '카카오 재인증이 필요할 수 있습니다. 문의 원본은 Gmail에서 확인하세요.'
        )
        delivery_alerted = True
    elif pending_alerts == 0 and delivery_alerted:
        messages.append('✅ LotteReal 카카오 문의 알림 전달 복구')
        delivery_alerted = False

    if supabase_ok is False:
        supabase_successes = 0
        supabase_failures = min(2, supabase_failures + 1)
        if supabase_failures >= 2 and not supabase_alerted:
            supabase_alerted = True
            messages.append(
                '⚠️ LotteReal Supabase 연결 점검 필요\n'
                '상태: 2회 연속 health check 실패\n'
                '새 문의 원본은 Gmail에 보존됩니다.\n'
                'credential·고객정보·응답본문은 포함하지 않았습니다.'
            )
    elif supabase_ok is True:
        if supabase_alerted:
            supabase_successes += 1
            if supabase_successes >= 2:
                messages.append(
                    '✅ LotteReal Supabase 연결 정상 복구\n'
                    '현재: read-only health check 2회 연속 정상'
                )
                supabase_failures = 0
                supabase_successes = 0
                supabase_alerted = False
        else:
            supabase_failures = 0
            supabase_successes = 0

    state: dict[str, object] = {'stale_alerted': stale}
    if delivery_alerted is not None:
        state['delivery_alerted'] = delivery_alerted
    if state_has_supabase:
        state.update({
            'supabase_alerted': supabase_alerted,
            'supabase_failures': supabase_failures,
            'supabase_successes': supabase_successes,
        })
    message = '\n\n'.join(messages)
    if message:
        handoff_id = hashlib.sha256(
            (message + json.dumps(state, sort_keys=True)).encode('utf-8')
        ).hexdigest()
        _write_state(state_path, {
            **previous_state,
            'handoff': {
                'id': handoff_id,
                'message': message,
                'next_state': state,
            },
        })
    else:
        _write_state(state_path, state)
    return message


def main(*, environ=None, probe=probe_supabase) -> int:
    environment = os.environ if environ is None else environ
    env_path = Path(environment.get('LOTTEREAL_ENV_PATH', DEFAULT_ENV_PATH))
    heartbeat_path = Path(
        environment.get('LOTTEREAL_GMAIL_WATCH_HEARTBEAT', DEFAULT_HEARTBEAT_PATH)
    )
    state_path = Path(
        environment.get('LOTTEREAL_INQUIRY_ANOMALY_STATE', DEFAULT_STATE_PATH)
    )
    lock_path = state_path.with_suffix(state_path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        message = run_once(
            heartbeat_path,
            state_path,
            supabase_ok=probe(env_path),
            ack_id=environment.get('LOTTEREAL_INQUIRY_ANOMALY_ACK_ID'),
        )
        if message:
            print(message)
    return 0


def cli(*, main_fn=main) -> int:
    try:
        return main_fn()
    except Exception:
        print('LotteReal 운영 감시 실행 실패', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(cli())
