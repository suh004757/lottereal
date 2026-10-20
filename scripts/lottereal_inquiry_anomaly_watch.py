#!/usr/bin/env python3
"""Deterministic anomaly notifier for the LotteReal Gmail inquiry watcher."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


DEFAULT_ENV_PATH = Path('/opt/data/.env')
DEFAULT_HEARTBEAT_PATH = Path('/opt/data/state/lottereal/gmail-inquiry-watch-heartbeat.json')
DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal/inquiry-anomaly-watch.json')
WARNING_COOLDOWN = timedelta(hours=6)


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


def _warning_due(last_warned: datetime | None, now: datetime) -> bool:
    if last_warned is None:
        return True
    elapsed = now.astimezone(timezone.utc) - last_warned.astimezone(timezone.utc)
    return elapsed < timedelta(0) or elapsed >= WARNING_COOLDOWN


def _write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    with temporary.open('w', encoding='utf-8') as output:
        json.dump(state, output, sort_keys=True)
        output.flush()
        os.fchmod(output.fileno(), 0o600)
        os.fsync(output.fileno())
    os.replace(temporary, path)
    directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _quarantine(path: Path) -> None:
    quarantine = path.with_name(path.name + '.corrupt')
    suffix = 1
    while quarantine.exists():
        quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
        suffix += 1
    os.chmod(path, 0o600)
    os.replace(path, quarantine)


def _read_previous_state(state_path: Path) -> dict[str, object]:
    if not state_path.exists():
        return {}
    previous = json.loads(state_path.read_text(encoding='utf-8'))
    if isinstance(previous, dict) and 'handoff' in previous:
        handoff = previous.get('handoff')
        if not isinstance(handoff, dict) or not isinstance(handoff.get('next_state'), dict):
            raise ValueError('invalid obsolete handoff')
        previous = handoff['next_state']
    allowed_keys = {
        'stale_alerted', 'stale_last_warned_at',
        'delivery_alerted', 'delivery_last_warned_at',
        'supabase_alerted', 'supabase_failures', 'supabase_successes',
        'supabase_last_warned_at',
    }
    if not isinstance(previous, dict) or not set(previous).issubset(allowed_keys):
        raise ValueError('invalid anomaly state')
    if not isinstance(previous.get('stale_alerted'), bool):
        raise ValueError('invalid anomaly state')
    for key in ('stale_last_warned_at', 'delivery_last_warned_at', 'supabase_last_warned_at'):
        if key in previous and _parse_timestamp(previous[key]) is None:
            raise ValueError('invalid anomaly warning time')
    if 'delivery_alerted' in previous and not isinstance(previous['delivery_alerted'], bool):
        raise ValueError('invalid anomaly state')
    if any(key.startswith('supabase_') for key in previous):
        successes = previous.get('supabase_successes', 0)
        if (
            not isinstance(previous.get('supabase_alerted'), bool)
            or not isinstance(previous.get('supabase_failures'), int)
            or isinstance(previous.get('supabase_failures'), bool)
            or not 0 <= previous['supabase_failures'] <= 2
            or not isinstance(successes, int)
            or isinstance(successes, bool)
            or not 0 <= successes <= 1
        ):
            raise ValueError('invalid Supabase anomaly state')
    return previous


def run_once(
    heartbeat_path: Path,
    state_path: Path,
    *,
    now: datetime | None = None,
    supabase_ok: bool | None = None,
) -> str:
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise ValueError('current time must be timezone-aware')

    recorded = None
    pending_alerts = 0
    oldest_pending = None
    pending_errors: dict[str, int] = {}
    if heartbeat_path.exists():
        try:
            payload = json.loads(heartbeat_path.read_text(encoding='utf-8'))
            raw_pending = payload.get('pending_alerts', 0)
            if isinstance(raw_pending, int) and not isinstance(raw_pending, bool) and raw_pending > 0:
                pending_alerts = raw_pending
            oldest_pending = _parse_timestamp(payload.get('oldest_pending_at'))
            raw_errors = payload.get('pending_errors', {})
            if isinstance(raw_errors, dict) and all(
                isinstance(key, str)
                and isinstance(value, int)
                and not isinstance(value, bool)
                and value > 0
                for key, value in raw_errors.items()
            ):
                pending_errors = raw_errors
            raw_recorded = payload.get('last_success_at', payload.get('last_attempt_at'))
            if not isinstance(raw_recorded, str):
                raise ValueError('invalid heartbeat time')
            recorded = _parse_timestamp(raw_recorded)
            if recorded is None:
                raise ValueError('heartbeat time must be timezone-aware')
        except (OSError, AttributeError, json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError):
            recorded = None

    try:
        previous = _read_previous_state(state_path)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError, KeyError, TypeError, ValueError):
        _quarantine(state_path)
        previous = {}

    previous_stale = bool(previous.get('stale_alerted', False))
    stale_last_warned = _parse_timestamp(previous.get('stale_last_warned_at'))
    delivery_alerted = previous.get('delivery_alerted')
    delivery_last_warned = _parse_timestamp(previous.get('delivery_last_warned_at'))
    supabase_alerted = bool(previous.get('supabase_alerted', False))
    raw_failures = previous.get('supabase_failures', 0)
    raw_successes = previous.get('supabase_successes', 0)
    supabase_failures = (
        raw_failures if isinstance(raw_failures, int) and not isinstance(raw_failures, bool) else 0
    )
    supabase_successes = (
        raw_successes if isinstance(raw_successes, int) and not isinstance(raw_successes, bool) else 0
    )
    supabase_last_warned = _parse_timestamp(previous.get('supabase_last_warned_at'))
    state_has_supabase = supabase_ok is not None or any(
        key.startswith('supabase_') for key in previous
    )

    age = None if recorded is None else instant.astimezone(timezone.utc) - recorded
    stale = age is None or age < timedelta(0) or age >= timedelta(minutes=7)
    messages: list[str] = []
    if stale and (not previous_stale or _warning_due(stale_last_warned, instant)):
        messages.append(
            '⚠️ LotteReal 문의 알림 점검 필요\n'
            '유형: Gmail watcher 실행 지연\n'
            '마지막 정상 확인: 7분 이상 전\n'
            '고객정보·메일 본문·직방 링크는 포함하지 않았습니다.'
        )
        stale_last_warned = instant
    elif not stale and previous_stale:
        messages.append('✅ LotteReal 문의 watcher 정상 복구\n현재: 정상 실행 중')
        stale_last_warned = None

    pending_age = None if oldest_pending is None else instant.astimezone(timezone.utc) - oldest_pending
    ambiguous = pending_errors.get('kakao_ambiguous', 0) > 0
    undelivered = pending_alerts > 0 and (
        ambiguous or pending_age is None or pending_age >= timedelta(hours=6)
    )
    if undelivered and (
        not delivery_alerted or _warning_due(delivery_last_warned, instant)
    ):
        if ambiguous:
            heading = '⚠️ LotteReal 카카오 전송 결과 수동 확인 필요'
            guidance = '자동 재전송하지 않습니다. Gmail과 카카오 발송 내역을 대조하세요.'
        elif set(pending_errors) & {'detail_fetch', 'parse_invalid'}:
            heading = '⚠️ LotteReal 문의 상세 처리 지연'
            guidance = '문의 원본은 Gmail에서 확인하세요.'
        elif 'receipt_publish' in pending_errors:
            heading = '⚠️ LotteReal 문의 접수 공개 처리 지연'
            guidance = '문의 원본은 Gmail에 보존됩니다.'
        else:
            heading = '⚠️ LotteReal 문의 알림 전달 실패'
            guidance = '카카오 재인증이 필요할 수 있습니다. 문의 원본은 Gmail에서 확인하세요.'
        age_text = '대기 시간: 확인 불가' if pending_age is None else '가장 오래된 대기: 6시간 이상'
        messages.append(f'{heading}\n알림 대기: {pending_alerts}건, {age_text}\n{guidance}')
        delivery_alerted = True
        delivery_last_warned = instant
    elif pending_alerts == 0 and delivery_alerted:
        messages.append('✅ LotteReal 카카오 문의 알림 전달 복구')
        delivery_alerted = False
        delivery_last_warned = None

    if supabase_ok is False:
        supabase_successes = 0
        supabase_failures = min(2, supabase_failures + 1)
        if supabase_failures >= 2 and (
            not supabase_alerted or _warning_due(supabase_last_warned, instant)
        ):
            supabase_alerted = True
            supabase_last_warned = instant
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
                supabase_last_warned = None
        else:
            supabase_failures = 0
            supabase_successes = 0

    state: dict[str, object] = {'stale_alerted': stale}
    if stale_last_warned is not None:
        state['stale_last_warned_at'] = _timestamp(stale_last_warned)
    if delivery_alerted is not None:
        state['delivery_alerted'] = delivery_alerted
    if delivery_last_warned is not None:
        state['delivery_last_warned_at'] = _timestamp(delivery_last_warned)
    if state_has_supabase:
        state.update({
            'supabase_alerted': supabase_alerted,
            'supabase_failures': supabase_failures,
            'supabase_successes': supabase_successes,
        })
        if supabase_last_warned is not None:
            state['supabase_last_warned_at'] = _timestamp(supabase_last_warned)
    _write_state(state_path, state)
    return '\n\n'.join(messages)


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
