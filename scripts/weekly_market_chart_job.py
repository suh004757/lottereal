#!/usr/bin/env python3
"""Scheduled job: refresh the home weekly REB chart, verify, commit, push.

Runs server-side (Hermes cron, after the Thursday 14:00 REB weekly release).
Silent when the chart is already current. On any failure it restores the two
generated files and exits non-zero with a short reason; it never prints secrets.
"""
from __future__ import annotations

import json
import hashlib
import fcntl
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import TextIO

sys.path.insert(0, str(Path(__file__).resolve().parent))
import post_push_guard  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
OUTPUTS = ["public/index.html", "public/Data/weekly-apt-change.json"]
_GIT_ENTRY = REPO / ".git"
GIT_STATE = _GIT_ENTRY if _GIT_ENTRY.is_dir() else Path(
    _GIT_ENTRY.read_text(encoding="utf-8").strip().removeprefix("gitdir: ")
)
MUTEX = GIT_STATE / "weekly-market-chart-job.lock"
GUARD_PENDING = GIT_STATE / "weekly-market-chart-post-push-guard.pending"
_MUTEX_HANDLES: dict[str, TextIO] = {}
TESTS = [
    "tests.test_weekly_market_chart",
    "tests.test_home_motion",
    "tests.test_listing_ui",
    "tests.test_homepage_search_snippet",
]


def run(cmd: list[str], env: dict[str, str] | None = None, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=REPO, text=True, capture_output=True, timeout=timeout, env=env)


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def snapshot_outputs(paths: list[Path]) -> dict[Path, bytes | None]:
    return {path: path.read_bytes() if path.exists() else None for path in paths}


def output_hashes(paths: list[Path]) -> dict[Path, str | None]:
    return {path: _hash(path.read_bytes()) if path.exists() else None for path in paths}


def restore_outputs(snapshots: dict[Path, bytes | None], generated: dict[Path, str | None]) -> list[Path]:
    conflicts = []
    for path, original in snapshots.items():
        current = _hash(path.read_bytes()) if path.exists() else None
        if current != generated.get(path):
            conflicts.append(path)
            continue
        if original is None:
            path.unlink(missing_ok=True)
        else:
            temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.restore")
            temporary.write_bytes(original)
            os.replace(temporary, path)
    return conflicts


def acquire_mutex(path: Path) -> str:
    token = uuid.uuid4().hex
    payload = json.dumps({"token": token, "pid": os.getpid()}) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    stream = path.open("a+", encoding="utf-8")
    try:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        stream.close()
        raise RuntimeError("weekly chart job is already running") from error
    stream.seek(0)
    stream.truncate()
    stream.write(payload)
    stream.flush()
    os.fsync(stream.fileno())
    _MUTEX_HANDLES[token] = stream
    return token


def release_mutex(path: Path, token: str) -> None:
    stream = _MUTEX_HANDLES.pop(token, None)
    if stream is not None:
        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()


def fail(reason: str, snapshots: dict[Path, bytes | None], generated: dict[Path, str | None]) -> int:
    conflicts = restore_outputs(snapshots, generated)
    if conflicts:
        reason += "; intervening changes preserved: " + ", ".join(str(path) for path in conflicts)
    print(f"LotteReal weekly chart job failed: {reason}")
    return 1


def run_guard() -> int:
    guard = run([sys.executable, "scripts/post_push_guard.py"], timeout=1200)
    if guard.returncode == 0:
        GUARD_PENDING.unlink(missing_ok=True)
    return guard.returncode


def _main() -> int:
    env_values = post_push_guard.load_env(post_push_guard.DEFAULT_ENV)
    git_env, _ = post_push_guard.git_env_with_token(env_values)

    # Pull, push and the failure reset all assume main; on any other branch they would
    # merge main into it, push a different ref, or wipe it. Refuse instead.
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    if branch != "main":
        print(f"LotteReal weekly chart job skipped: checkout is on '{branch or 'unknown'}', not main")
        return 1
    if run(["git", "status", "--porcelain"]).stdout.strip():
        print("LotteReal weekly chart job skipped: working tree has other changes")
        return 1
    if run(["git", "pull", "--ff-only", "origin", "main"], env=git_env).returncode != 0:
        print("LotteReal weekly chart job failed: git pull --ff-only")
        return 1

    output_paths = [REPO / relative for relative in OUTPUTS]
    snapshots = snapshot_outputs(output_paths)
    update = run([sys.executable, "scripts/update_weekly_market_chart.py"])
    if update.returncode != 0:
        return fail(f"update: {update.stderr.strip()[-300:]}", snapshots, output_hashes(output_paths))
    result = json.loads(update.stdout.strip().splitlines()[-1])
    if not result.get("changed"):
        return run_guard() if GUARD_PENDING.exists() else 0
    generated = output_hashes(output_paths)

    tests = run([sys.executable, "-m", "unittest", *TESTS])
    if tests.returncode != 0:
        return fail("focused unittest failed", snapshots, generated)
    if run([sys.executable, "-m", "py_compile", "scripts/update_weekly_market_chart.py"]).returncode != 0:
        return fail("py_compile failed", snapshots, generated)

    survey = result["survey_date"]
    run(["git", "add", *OUTPUTS])
    commit = run(["git", "commit", "-m", f"[verified] Refresh weekly REB apartment chart ({survey})"])
    if commit.returncode != 0:
        return fail("git commit failed", snapshots, generated)
    if run(["git", "push", "origin", "HEAD:main"], env=git_env).returncode != 0:
        print("LotteReal weekly chart job failed: git push (local commit preserved for retry)")
        return 1

    GUARD_PENDING.write_text(json.dumps({"survey_date": survey}) + "\n", encoding="utf-8")
    guard_code = run_guard()
    status = "ok" if guard_code == 0 else f"post_push_guard exit {guard_code}"
    print(f"LotteReal weekly chart refreshed to {survey} ({status})")
    return 0 if guard_code == 0 else 1


def main() -> int:
    try:
        token = acquire_mutex(MUTEX)
    except RuntimeError as error:
        print(f"LotteReal weekly chart job skipped: {error}")
        return 1
    try:
        return _main()
    finally:
        release_mutex(MUTEX, token)


if __name__ == "__main__":
    raise SystemExit(main())
