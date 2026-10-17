#!/usr/bin/env python3
"""Scheduled job: refresh the home weekly REB chart, verify, commit, push.

Runs server-side (Hermes cron, after the Thursday 14:00 REB weekly release).
Silent when the chart is already current. On any failure it restores the two
generated files and exits non-zero with a short reason; it never prints secrets.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import post_push_guard  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
OUTPUTS = ["public/index.html", "public/Data/weekly-apt-change.json"]
TESTS = [
    "tests.test_weekly_market_chart",
    "tests.test_home_motion",
    "tests.test_listing_ui",
    "tests.test_homepage_search_snippet",
]


def run(cmd: list[str], env: dict[str, str] | None = None, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=REPO, text=True, capture_output=True, timeout=timeout, env=env)


def fail(reason: str) -> int:
    run(["git", "checkout", "--", *OUTPUTS])
    print(f"LotteReal weekly chart job failed: {reason}")
    return 1


def main() -> int:
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

    update = run([sys.executable, "scripts/update_weekly_market_chart.py"])
    if update.returncode != 0:
        return fail(f"update: {update.stderr.strip()[-300:]}")
    result = json.loads(update.stdout.strip().splitlines()[-1])
    if not result.get("changed"):
        return 0

    tests = run([sys.executable, "-m", "unittest", *TESTS])
    if tests.returncode != 0:
        return fail("focused unittest failed")
    if run([sys.executable, "-m", "py_compile", "scripts/update_weekly_market_chart.py"]).returncode != 0:
        return fail("py_compile failed")

    survey = result["survey_date"]
    run(["git", "add", *OUTPUTS])
    commit = run(["git", "commit", "-m", f"[verified] Refresh weekly REB apartment chart ({survey})"])
    if commit.returncode != 0:
        return fail("git commit failed")
    if run(["git", "push", "origin", "HEAD:main"], env=git_env).returncode != 0:
        run(["git", "reset", "--hard", "origin/main"])
        print("LotteReal weekly chart job failed: git push (local commit discarded)")
        return 1

    guard = run([sys.executable, "scripts/post_push_guard.py"], timeout=1200)
    status = "ok" if guard.returncode == 0 else f"post_push_guard exit {guard.returncode}"
    print(f"LotteReal weekly chart refreshed to {survey} ({status})")
    return 0 if guard.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
