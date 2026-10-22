#!/usr/bin/env python3
"""Durable metadata-only watcher for private ADMIN intake drafts.

Stdout has no delivery acknowledgement, so active drafts remain pending and are
re-emitted on a bounded cooldown until they leave the draft query.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import sys
from uuid import UUID

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lottereal_admin_intake_scan import fetch_admin_intakes


DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal-admin-intake-watch.json')
MAX_ALERT_DRAFTS = 3
QUEUE_VERSION = 1
REEMIT_COOLDOWN = timedelta(hours=1)
RECOVERY_SIGNAL = '⚠️ ADMIN intake watcher state recovered; active drafts will be replayed.'


class UnsupportedQueueVersion(RuntimeError):
    """State belongs to a newer or incompatible watcher runtime."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError('watcher time must be timezone-aware')
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else None
    except (ValueError, OverflowError):
        return None


def normalize_draft_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        return None


def empty_state() -> dict:
    return {'queue_version': QUEUE_VERSION, 'pending': {}}


def _validate_state(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError('invalid ADMIN intake watcher state')
    version = payload.get('queue_version')
    if version != QUEUE_VERSION:
        if isinstance(version, int) and version > QUEUE_VERSION:
            raise UnsupportedQueueVersion('unsupported ADMIN intake watcher state version')
        raise ValueError('invalid ADMIN intake watcher state version')
    pending = payload.get('pending')
    if not isinstance(pending, dict):
        raise ValueError('invalid ADMIN intake pending queue')
    validated = {}
    for key, item in pending.items():
        if (
            normalize_draft_id(key) != key
            or not isinstance(item, dict)
            or set(item) != {'id', 'discovered_at', 'last_emitted_at', 'emit_count'}
            or item.get('id') != key
            or _parse_timestamp(item.get('discovered_at')) is None
            or (
                item.get('last_emitted_at') is not None
                and _parse_timestamp(item.get('last_emitted_at')) is None
            )
            or not isinstance(item.get('emit_count'), int)
            or isinstance(item.get('emit_count'), bool)
            or not 0 <= item['emit_count'] <= 1_000_000
        ):
            raise ValueError('invalid ADMIN intake pending item')
        validated[key] = dict(item)
    return {'queue_version': QUEUE_VERSION, 'pending': validated}


def _fsync_directory(path: Path) -> None:
    directory_fd = os.open(path, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def load_state(path: Path) -> tuple[dict, bool]:
    if not path.exists():
        return empty_state(), False
    try:
        return _validate_state(json.loads(path.read_text(encoding='utf-8'))), False
    except UnsupportedQueueVersion:
        raise
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        quarantine = path.with_name(path.name + '.corrupt')
        suffix = 1
        while quarantine.exists():
            quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
            suffix += 1
        os.chmod(path, 0o600)
        os.replace(path, quarantine)
        _fsync_directory(path.parent)
        return empty_state(), True


def write_state(path: Path, state: dict) -> None:
    validated = _validate_state(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    try:
        with temporary.open('w', encoding='utf-8') as output:
            json.dump(validated, output, ensure_ascii=False, sort_keys=True)
            output.flush()
            os.fchmod(output.fileno(), 0o600)
            os.fsync(output.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def safe_image_count(value: object) -> int:
    try:
        count = int(str(value)) if value is not None else 0
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(count, 30))


def build_alert(drafts: list[dict]) -> str:
    count = len(drafts)
    lines = [f'📥 롯데부동산 새 ADMIN 초안 {count}건']
    for draft in drafts[:MAX_ALERT_DRAFTS]:
        raw_metadata = draft.get('metadata')
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
        intake_type = '매물' if metadata.get('intake_type') == 'listing' else '글'
        image_count = safe_image_count(metadata.get('image_count'))
        image_state = '업로드 완료' if metadata.get('photo_upload_state') == 'complete' else '확인 필요'
        normalized_id = normalize_draft_id(draft.get('id'))
        draft_id = normalized_id[:8] if normalized_id else '확인불가'
        lines.extend([
            '',
            f'• {intake_type}',
            f'• 사진 {image_count}장 · {image_state}',
            f'• 접수번호 {draft_id}',
        ])
    if count > MAX_ALERT_DRAFTS:
        lines.extend(['', f'외 {count - MAX_ALERT_DRAFTS}건은 관리자 화면에서 확인하세요.'])
    lines.extend(['', '비공개 검토 대기 상태이며 자동 게시되지 않았습니다.'])
    return '\n'.join(lines)


def process_drafts(
    drafts: list[dict],
    state_path: Path,
    *,
    now: datetime | None = None,
) -> list[str]:
    instant = (now or _utc_now()).astimezone(timezone.utc)
    state, recovered = load_state(state_path)
    current: dict[str, dict] = {}
    for draft in drafts:
        draft_id = normalize_draft_id(draft.get('id'))
        if draft_id and draft_id not in current:
            current[draft_id] = draft

    previous = state['pending']
    pending = {}
    due_ids = []
    for draft_id in current:
        item = previous.get(draft_id)
        if item is None:
            item = {
                'id': draft_id,
                'discovered_at': _timestamp(instant),
                'last_emitted_at': None,
                'emit_count': 0,
            }
        else:
            item = dict(item)
        last_emitted = _parse_timestamp(item['last_emitted_at'])
        if (
            last_emitted is None
            or instant < last_emitted
            or instant - last_emitted >= REEMIT_COOLDOWN
        ):
            item['last_emitted_at'] = _timestamp(instant)
            item['emit_count'] = min(item['emit_count'] + 1, 1_000_000)
            due_ids.append(draft_id)
        pending[draft_id] = item

    write_state(state_path, {'queue_version': QUEUE_VERSION, 'pending': pending})
    messages = [RECOVERY_SIGNAL] if recovered else []
    if due_ids:
        messages.append(build_alert([current[draft_id] for draft_id in due_ids]))
    return messages


def main() -> int:
    state_path = Path(os.environ.get('LOTTEREAL_ADMIN_INTAKE_WATCH_STATE', DEFAULT_STATE_PATH))
    lock_path = state_path.with_suffix(state_path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0

        messages = process_drafts(fetch_admin_intakes(), state_path, now=_utc_now())
        for message in messages:
            print(message, flush=True)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('ADMIN intake watcher failed.', file=sys.stderr)
        raise SystemExit(1) from None
