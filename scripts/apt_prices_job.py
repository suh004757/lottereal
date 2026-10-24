#!/usr/bin/env python3
"""Scheduled job: refresh the Songpa apartment and villa price pages, verify, commit, push.

Runs server-side (Hermes cron, daily). Silent when MOLIT has no new trades. It only
starts from a clean main checkout, so on any failure it restores the generated paths
with git and exits non-zero with a short reason; it never prints the service key.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import post_push_guard  # noqa: E402
from weekly_market_chart_job import GIT_STATE, acquire_mutex, release_mutex, run  # noqa: E402

MUTEX = GIT_STATE / "apt-prices-job.lock"
OUTPUTS = ["data/songpa-apt-trades.v1.json", "data/songpa-villa-prices.v1.json", "public/apartments", "public/villas",
           "public/songpa-apartment-prices.html", "public/songpa-villa-prices.html", "public/Sitemap.xml"]
GENERATORS = ["scripts/songpa_apt_prices.py", "scripts/songpa_villa_prices.py"]
TESTS = ["tests.test_songpa_apt_prices", "tests.test_songpa_villa_prices","tests.test_analytics_coverage", "tests.test_korean_labels", "tests.test_pages_artifact"]


def restore() -> None:
    run(["git", "checkout", "--", *OUTPUTS])
    run(["git", "clean", "-fdq", "--", "public/apartments", "public/villas"])


def fail(reason: str) -> int:
    restore()
    print(f"LotteReal apartment prices job failed: {reason}")
    return 1


def _main() -> int:
    env_values = post_push_guard.load_env(post_push_guard.DEFAULT_ENV)
    git_env, _ = post_push_guard.git_env_with_token(env_values)
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    if branch != "main":
        print(f"LotteReal apartment prices job skipped: checkout is on '{branch or 'unknown'}', not main")
        return 1
    if run(["git", "status", "--porcelain"]).stdout.strip():
        print("LotteReal apartment prices job skipped: working tree has other changes")
        return 1
    if run(["git", "pull", "--ff-only", "origin", "main"], env=git_env).returncode != 0:
        print("LotteReal apartment prices job failed: git pull --ff-only")
        return 1
    if run(["git", "rev-list", "--count", "origin/main..HEAD"]).stdout.strip() not in ("", "0"):
        if run(["git", "push", "origin", "HEAD:main"], env=git_env).returncode != 0:
            print("LotteReal apartment prices job failed: git push retry (local commit preserved)")
            return 1

    changed = False
    for generator in GENERATORS:
        update = run([sys.executable, generator, "refresh"], timeout=900)
        if update.returncode != 0:
            return fail(f"{Path(generator).stem} refresh: {update.stderr.strip()[-300:]}")
        changed |= bool(json.loads(update.stdout.strip().splitlines()[-1]).get("changed"))
    if not changed:
        return 0
    if run([sys.executable, "-m", "unittest", *TESTS]).returncode != 0:
        return fail("focused unittest failed")

    run(["git", "add", "-A", "--", *OUTPUTS])
    if run(["git", "commit", "-m", "[verified] Refresh Songpa apartment and villa prices (MOLIT)"]).returncode != 0:
        return fail("git commit failed")
    if run(["git", "push", "origin", "HEAD:main"], env=git_env).returncode != 0:
        print("LotteReal apartment prices job failed: git push (local commit preserved for retry)")
        return 1
    guard = run([sys.executable, "scripts/post_push_guard.py"], timeout=1200)
    print(f"LotteReal apartment prices refreshed (post_push_guard exit {guard.returncode})")
    return 0 if guard.returncode == 0 else 1


def main() -> int:
    try:
        token = acquire_mutex(MUTEX)
    except RuntimeError as error:
        print(f"LotteReal apartment prices job skipped: {error}")
        return 1
    try:
        return _main()
    finally:
        release_mutex(MUTEX, token)


if __name__ == "__main__":
    raise SystemExit(main())
