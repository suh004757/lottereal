#!/usr/bin/env python3
"""One-time, snapshot-grounded reconciliation for pre-v2 watcher outcomes."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
from pathlib import Path

try:
    from .lottereal_gmail_inquiry_watch import load_state, reconcile_legacy_pending
except ImportError:  # Direct script execution from scripts/.
    from lottereal_gmail_inquiry_watch import load_state, reconcile_legacy_pending


def load_legacy_snapshot_strict(path: Path) -> set[str]:
    """Read a pre-v2 snapshot without recovery, quarantine, or mutation."""
    if not path.is_file():
        raise FileNotFoundError(path)
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError('invalid legacy snapshot JSON') from error
    if not isinstance(payload, dict) or payload.get('initialized') is not True:
        raise ValueError('invalid legacy snapshot')
    if 'queue_version' in payload or 'pending' in payload:
        raise ValueError('expected a pre-v2 snapshot')
    keys = payload.get('seen_keys')
    fallback_keys = payload.get('fallback_keys')
    parse_failures = payload.get('parse_failures')
    dead_keys = payload.get('dead_keys')
    if (
        not isinstance(keys, list)
        or not isinstance(fallback_keys, list)
        or not isinstance(parse_failures, dict)
        or not isinstance(dead_keys, list)
        or not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in keys)
        or not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in fallback_keys)
        or not all(isinstance(key, str) and re.fullmatch(r'[0-9a-f]{64}', key) for key in dead_keys)
        or not all(
            isinstance(key, str)
            and re.fullmatch(r'[0-9a-f]{64}', key)
            and isinstance(count, int)
            and not isinstance(count, bool)
            and 1 <= count <= 2
            for key, count in parse_failures.items()
        )
    ):
        raise ValueError('invalid legacy snapshot fields')
    return set(fallback_keys)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--legacy-snapshot', type=Path, required=True)
    args = parser.parse_args()
    if args.state.resolve() == args.legacy_snapshot.resolve():
        raise ValueError('snapshot must be separate from live state')
    legacy_keys = load_legacy_snapshot_strict(args.legacy_snapshot)
    lock_path = args.state.with_suffix(args.state.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('a+', encoding='utf-8') as lock_file:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        before = load_state(args.state)
        before_pending = len(before.get('pending', {}))
        changed = reconcile_legacy_pending(args.state, legacy_keys)
        after = load_state(args.state)
        remaining_retryable_legacy = sum(
            1 for key in legacy_keys
            if isinstance(after.get('pending', {}).get(key), dict)
            and after['pending'][key].get('status') == 'pending'
        )
    if remaining_retryable_legacy:
        raise RuntimeError('legacy outcomes remain retryable')
    print(json.dumps({
        'ok': True,
        'snapshot_legacy_keys': len(legacy_keys),
        'pending_before': before_pending,
        'changed_to_ambiguous': changed,
        'remaining_retryable_legacy': remaining_retryable_legacy,
    }))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
