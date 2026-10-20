# Gmail inquiry delivery queue operations

## Durable queue

The Gmail watcher writes every newly verified inquiry to the private state file before any downstream request. The pending record contains only a message hash, Gmail UID, fixed platform/title values, trusted timestamps, allowlisted listing metadata, and these delivery fields:

- `first_failed_at`
- `attempt_count`
- `next_retry_at`
- `last_error` (fixed error code only)
- `status` (`pending`, `dispatching`, or `accepted`)

The queue is not reconstructed from Gmail, so work remains retryable after it leaves the Gmail `latest 100` / `30 day` discovery window. New and due-retry work each reserve five slots in the ten-item batch; unused slots are borrowed. Retry delay starts at 60 seconds, doubles per attempt, and is capped at six hours.

`dispatching` is written before calling Kakao. `accepted` is written immediately after Kakao returns `result_code: 0`, before token-file maintenance. On restart, `accepted` work is finalized without another Kakao request. An item left in `dispatching` is not automatically resent because Kakao Memo has no provider idempotency key or delivery-status lookup; inspect it manually and reconcile the hashed key in the private state file.

## Watchdog handoff acknowledgement

The anomaly watcher stores a privacy-safe alert in `inquiry-anomaly-watch.json` as:

```json
{
  "handoff": {
    "id": "<sha256>",
    "message": "<privacy-safe alert>",
    "next_state": {"...": "state to commit after delivery"}
  }
}
```

Until the external notifier confirms delivery, each cron invocation returns the same message and alert state does not advance. After the notifier has successfully delivered that exact message, acknowledge it on a subsequent cron invocation:

```bash
LOTTEREAL_INQUIRY_ANOMALY_ACK_ID="$(jq -r '.handoff.id' /opt/data/state/lottereal/inquiry-anomaly-watch.json)" \
  python3 scripts/lottereal_inquiry_anomaly_watch.py
```

The notifier must set the acknowledgement only after its transport reports success. A missing or wrong ID leaves the handoff pending. Recovery is emitted only after all inquiry queue items are resolved, and it also requires an external-delivery acknowledgement.

Both watchers use nonblocking `flock`; queue, heartbeat, anomaly, and lock files are maintained with mode `0600`.

## Provider limitation

Kakao Memo confirms API acceptance but supplies neither an idempotency-key facility nor a queryable per-message delivery receipt. A process failure in the narrow interval after Kakao accepts a message but before the local `accepted` write can therefore be resolved only by choosing between possible duplication and possible omission. The watcher chooses not to resend ambiguous `dispatching` records automatically, minimizing duplicate owner alerts while surfacing the unresolved pending age through the watchdog.
