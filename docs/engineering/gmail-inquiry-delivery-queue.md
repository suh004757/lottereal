# Gmail inquiry delivery queue operations

## Durable queue v2

The Gmail watcher writes each newly verified inquiry to the private state file before any downstream request. Queue writes use a mode-`0600` temporary file, flush and `fsync` the file, atomically replace the target, and then `fsync` the parent directory. Corrupt quarantines are also mode `0600`.

A pending record contains only a message hash, Gmail UID, fixed platform/title values, trusted timestamps, allowlisted listing metadata, and these delivery fields:

- `first_failed_at`
- `attempt_count`
- `next_retry_at`
- `last_error` (fixed error code only)
- `status` (`pending`, `dispatching`, `accepted`, or `ambiguous`)

Contact-access tokens and full inquiry URLs are never durable queue fields. The watcher fetches the current inquiry link into memory immediately before dispatch and strips legacy inquiry-link lines from an existing v2 queue with a crash-durable rewrite.

The queue is not reconstructed from Gmail, so retryable work remains available after it leaves the Gmail `latest 100` / `30 day` discovery window. New and due-retry work each reserve five slots in the ten-item batch; unused slots are borrowed. Retry delay starts at 60 seconds, doubles per attempt, and is capped at six hours.

`dispatching` is persisted before calling Kakao. `accepted` is persisted immediately after Kakao returns `result_code: 0`, before token-file maintenance. On restart, `accepted` work is finalized without another Kakao request. Once dispatch begins, an exception has an unknown provider outcome: the item becomes `ambiguous` with `last_error: kakao_ambiguous`, is not automatically retried, and requires manual reconciliation. This avoids converting a possible Kakao acceptance into an unsafe duplicate send. Pre-v2 `fallback_keys` are also migrated as `ambiguous`, because the legacy state cannot prove whether Kakao accepted the prior dispatch; they must never be replayed automatically during queue-v2 promotion.

## Alerts under `no_agent` cron

Production cron delivers process stdout and provides no acknowledgement callback. There is no ACK environment variable or stored handoff. Each active warning is committed when emitted and is re-emitted every six hours while unresolved. This bounds noise while ensuring one failed stdout gateway delivery cannot suppress the warning forever. Recovery is evaluated from current heartbeat/queue state and is emitted immediately; obsolete handoff state from the former protocol cannot block it.

Gmail fallback alerts use the same six-hour cooldown per unresolved queue key. Their durable warning timestamp is removed only when the underlying queue item is delivered or explicitly reconciled/resolved. Heartbeat error counts let the anomaly watcher distinguish detail parsing/fetch failures, public receipt publication failures, Kakao failures, and `kakao_ambiguous` manual-reconciliation work. If pending age is unavailable, the warning says that it is unknown and does not claim a six-hour age.

Both watchers use nonblocking `flock`; queue, heartbeat, anomaly, quarantine, and lock files are maintained with mode `0600`.

## Schema guard

`queue_version: 2` is the only queue-bearing schema accepted by this runtime. A state file with `pending` but no matching version, or a version newer than 2, raises `UnsupportedQueueVersion`. It is left byte-for-byte in place and is not quarantined or rewritten. This is a fail-closed signal to restore a compatible runtime rather than silently discarding fields.

An older runtime does not know this guard and must not run against queue_version: 2. Therefore runtime rollback is never script-only.

## Exact atomic promotion and rollback

The production unit consists of these reviewed files:

- `scripts/lottereal_gmail_inquiry_watch.py`
- `scripts/lottereal_inquiry_anomaly_watch.py`
- `scripts/reconcile_lottereal_legacy_queue.py` (required only for snapshot-grounded v1→v2 reconciliation)
- `docs/engineering/gmail-inquiry-delivery-queue.md` (operator reference; it is not runtime state)

Promotion must follow these steps without reading or printing private state contents:

1. Stop or disable both cron entries and acquire both watcher lock files so no old process remains active.
2. Record only file hashes/modes, then make a mode-`0600` pre-promotion snapshot of the Gmail queue, heartbeat, and anomaly state on the same protected filesystem.
3. Stage all three Python files in one versioned runtime directory on the destination filesystem; verify the reviewed SHA-256 hashes, set their intended modes, `fsync` every file, and `fsync` the staged directory.
4. Expose that complete runtime generation with the same atomic rename (or an atomic replacement of one stable generation symlink). Do not copy either watcher over its live path independently. `fsync` the parent directory after the rename.
5. If a queue-v2 dry run was already created from a pre-v2 state, run `scripts/reconcile_lottereal_legacy_queue.py --state <live-state> --legacy-snapshot <protected-pre-v2-snapshot>` while the cron remains stopped and the queue lock is held by the tool. This exact snapshot-key migration changes only matching `pending` outcomes to `ambiguous`; require `remaining_retryable_legacy: 0` before proceeding.
6. Run syntax checks and the focused tests against the promoted generation, then re-enable both cron entries together. Confirm one healthy run and verify only schema/version, counts, timestamps, and file modes—not customer data or URLs.

If the host layout cannot publish a generation directory, keep both cron entries stopped while replacing both files from a fully staged set, `fsync` each file and parent directory, verify both hashes, and start neither cron until both files match the reviewed generation. The stopped interval is the transaction boundary.

Rollback must follow these steps:

1. Stop both cron entries and acquire both locks before changing runtime or state.
2. If rolling back to a runtime that predates queue v2, restore the pre-promotion state snapshot together with the old two-file runtime generation. The old runtime must not run against queue_version: 2.
3. Publish the old runtime with the same generation-level atomic mechanism, atomically restore the pre-promotion state snapshot, preserve mode `0600`, and `fsync` every restored file and parent directory.
4. Verify hashes, schema version, file modes, and syntax before re-enabling both cron entries together.

Never roll back only one watcher, never start an old Gmail watcher on v2 state, and never “repair” a version error by deleting, truncating, or quarantining the queue.

## Provider limitation and manual reconciliation

Kakao Memo confirms API acceptance but supplies neither an idempotency-key facility nor a queryable per-message delivery receipt. For an `ambiguous` item, compare the hashed queue key and safe timestamp with Gmail and the owner’s Kakao history. After confirming whether the alert arrived, either finalize it as delivered or deliberately return it to `pending` under operator control. Do not place customer contact data, access tokens, or inquiry URLs in reconciliation notes.
