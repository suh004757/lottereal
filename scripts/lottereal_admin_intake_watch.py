#!/usr/bin/env python3
"""Token-free watcher for new private LotteReal ADMIN intake drafts.

The script prints one metadata-only alert when unseen draft IDs appear. Hermes
owns Discord delivery; this file contains no Discord credentials or transport.
"""

from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
import sys
from typing import Iterable
from uuid import UUID

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lottereal_admin_intake_scan import fetch_admin_intakes


DEFAULT_STATE_PATH = Path('/opt/data/state/lottereal-admin-intake-watch.json')
MAX_ALERT_DRAFTS = 3


def load_seen_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
        values = payload.get('seen_ids') if isinstance(payload, dict) else None
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            raise ValueError('Invalid ADMIN intake watcher state')
        return set(values)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        quarantine = path.with_name(path.name + '.corrupt')
        suffix = 1
        while quarantine.exists():
            quarantine = path.with_name(f'{path.name}.corrupt-{suffix}')
            suffix += 1
        os.replace(path, quarantine)
        return set()


def write_seen_ids(path: Path, seen_ids: Iterable[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    payload = {'seen_ids': sorted(set(seen_ids))}
    temporary.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True), encoding='utf-8')
    os.replace(temporary, path)


def normalize_draft_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        return None


def select_unseen(drafts: list[dict], seen_ids: set[str]) -> list[dict]:
    normalized_seen = {normalized for value in seen_ids if (normalized := normalize_draft_id(value))}
    unseen = []
    for draft in drafts:
        normalized_id = normalize_draft_id(draft.get('id'))
        if normalized_id and normalized_id not in normalized_seen:
            normalized_seen.add(normalized_id)
            unseen.append({**draft, 'id': normalized_id})
    return unseen


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
        lines.extend(['', f'외 {count - MAX_ALERT_DRAFTS}건은 “초안 확인”이라고 요청하면 전체를 불러옵니다.'])
    lines.extend(['', '비공개 검토 대기 상태이며 자동 게시되지 않았습니다.'])
    return '\n'.join(lines)


def main() -> int:
    state_path = Path(os.environ.get('LOTTEREAL_ADMIN_INTAKE_WATCH_STATE', DEFAULT_STATE_PATH))
    lock_path = state_path.with_suffix(state_path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0

        drafts = fetch_admin_intakes()
        seen_ids = load_seen_ids(state_path)
        unseen = select_unseen(drafts, seen_ids)
        if not unseen:
            return 0

        print(build_alert(unseen), flush=True)
        seen_ids.update(draft['id'] for draft in unseen)
        write_seen_ids(state_path, seen_ids)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('ADMIN intake watcher failed.', file=sys.stderr)
        raise SystemExit(1) from None
