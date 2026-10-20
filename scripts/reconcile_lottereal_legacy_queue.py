#!/usr/bin/env python3
"""One-time, snapshot-grounded reconciliation for pre-v2 watcher outcomes."""
from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path

from lottereal_gmail_inquiry_watch import load_state, reconcile_legacy_pending


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--legacy-snapshot', type=Path, required=True)
    args = parser.parse_args()
    if args.state.resolve() == args.legacy_snapshot.resolve():
        raise ValueError('snapshot must be separate from live state')
    snapshot = load_state(args.legacy_snapshot)
    if snapshot.get('queue_version') == 2:
        raise ValueError('expected a pre-v2 snapshot')
    legacy_keys = set(snapshot.get('fallback_keys', []))
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
