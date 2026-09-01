#!/usr/bin/env python3
"""Post-push live guard for lottes.co.kr.

Runs bounded verification after a main-branch push. If a rollback condition is met,
this script reverts the latest commit and pushes the revert. Secrets are read only
from the local environment file and are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[1]
DEFAULT_ENV = Path("/opt/data/.env")
DEFAULT_LIVE_CONFIG_URL = "https://lottes.co.kr/js/config/appConfig.js"

SECRET_PATTERNS = [
    "SUPABASE_SECRET_KEY",
    "service_role",
    "sb_secret_",
]


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"').strip("'")
    return values


def run(cmd: list[str], *, timeout: int = 180, env: dict[str, str] | None = None) -> tuple[int, str]:
    result = subprocess.run(cmd, cwd=REPO, text=True, capture_output=True, timeout=timeout, env=env)
    return result.returncode, ((result.stdout or "") + (result.stderr or ""))[-4000:]


def git_env_with_token(env_values: dict[str, str]) -> tuple[dict[str, str], Path | None]:
    token = env_values.get("GITHUB_TOKEN") or env_values.get("GH_TOKEN")
    if not token:
        return os.environ.copy(), None
    askpass = Path("/opt/data/cache/tmp/lottereal-git-askpass.sh")
    askpass.parent.mkdir(parents=True, exist_ok=True)
    askpass.write_text(
        '#!/bin/sh\n'
        'case "$1" in\n'
        '  *Username*) printf "%s" "x-access-token" ;;\n'
        '  *Password*) printf "%s" "$GITHUB_TOKEN" ;;\n'
        '  *) printf "" ;;\n'
        'esac\n',
        encoding="utf-8",
    )
    askpass.chmod(0o700)
    merged = os.environ.copy()
    merged["GIT_ASKPASS"] = str(askpass)
    merged["GITHUB_TOKEN"] = token
    merged["GIT_TERMINAL_PROMPT"] = "0"
    return merged, askpass


def fetch_live_config(url: str) -> tuple[int | None, str, str | None]:
    try:
        request = Request(url, headers={"User-Agent": "LotteReal-PostPushGuard", "Cache-Control": "no-cache"})
        with urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", errors="replace"), None
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        return exc.code, body, f"HTTPError {exc.code}"
    except (URLError, TimeoutError, OSError) as exc:
        return None, "", f"{type(exc).__name__}: {exc}"


def detect_secret_leak(body: str, env_values: dict[str, str]) -> list[str]:
    leaks = [pattern for pattern in SECRET_PATTERNS if pattern in body]
    secret = env_values.get("SUPABASE_SECRET_KEY", "")
    if secret and secret in body:
        leaks.append("actual_supabase_secret_value")
    return leaks


def local_verification_commands() -> list[tuple[list[str], int, str]]:
    if os.environ.get("LOTTEREAL_PUBLIC_CONTENT_ONLY") == "1":
        unittest_command = [
            sys.executable,
            "-m",
            "unittest",
            "tests.test_public_content_maintenance_scope",
            "tests.test_lease_opposability_current_form_update",
        ]
        return [
            (unittest_command, 180, "unittest"),
            ([sys.executable, "-m", "py_compile", "scripts/maintenance_check.py", "scripts/post_push_guard.py"], 120, "py_compile"),
            (["node", "--check", "js/reportPage.js"], 60, "node_check_report_page"),
            (["node", "--check", "js/reportLandingPage.js"], 60, "node_check_report_landing"),
            ([sys.executable, "scripts/maintenance_check.py"], 180, "maintenance_check"),
        ]
    return [
        ([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"], 180, "unittest"),
        ([sys.executable, "-m", "py_compile", "scripts/lottereal_supabase.py", "scripts/maintenance_check.py", "scripts/post_push_guard.py"], 120, "py_compile"),
        (["node", "--check", "js/config/appConfig.js"], 60, "node_check_app_config"),
        (["node", "--check", "js/active.js"], 60, "node_check_active"),
        ([sys.executable, "scripts/maintenance_check.py"], 180, "maintenance_check"),
    ]


def run_local_verification() -> list[dict[str, str | int]]:
    failures: list[dict[str, str | int]] = []
    commands = local_verification_commands()
    for cmd, timeout, name in commands:
        code, output = run(cmd, timeout=timeout)
        if code != 0:
            failures.append({"check": name, "exit_code": code, "output_tail": output})
    return failures


def rollback(reason: list[dict], env_values: dict[str, str]) -> dict:
    git_env, askpass = git_env_with_token(env_values)
    try:
        code, output = run(["git", "revert", "--no-edit", "HEAD"], timeout=180, env=git_env)
        if code != 0:
            return {"rolled_back": False, "stage": "git_revert", "exit_code": code, "output_tail": redact(output, env_values), "reason": reason}
        code, output = run(["git", "push", "origin", "main"], timeout=240, env=git_env)
        if code != 0:
            return {"rolled_back": False, "stage": "git_push_revert", "exit_code": code, "output_tail": redact(output, env_values), "reason": reason}
        head_code, head = run(["git", "rev-parse", "--short", "HEAD"], timeout=30, env=git_env)
        return {"rolled_back": True, "revert_head": head.strip() if head_code == 0 else None, "reason": reason}
    finally:
        if askpass:
            try:
                askpass.unlink()
            except FileNotFoundError:
                pass


def redact(text: str, env_values: dict[str, str]) -> str:
    redacted = text
    for key in ["GITHUB_TOKEN", "GH_TOKEN", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]:
        value = env_values.get(key, "")
        if value:
            redacted = redacted.replace(value, "[REDACTED]")
    return redacted


def check_once(live_config_url: str, env_values: dict[str, str]) -> list[dict]:
    failures: list[dict] = []
    status, body, error = fetch_live_config(live_config_url)
    if status != 200:
        failures.append({"check": "live_status", "status": status, "error": error})
    leaks = detect_secret_leak(body, env_values)
    if leaks:
        failures.append({"check": "live_app_config_secret_pattern", "patterns": leaks})
    failures.extend(run_local_verification())
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--live-config-url", default=DEFAULT_LIVE_CONFIG_URL)
    parser.add_argument("--wait-seconds", type=int, default=300)
    parser.add_argument("--no-rollback", action="store_true")
    args = parser.parse_args()

    env_values = load_env(args.env)
    first_failures = check_once(args.live_config_url, env_values)
    if first_failures:
        result = {"ok": False, "phase": "immediate", "failures": first_failures}
        if not args.no_rollback:
            result["rollback"] = rollback(first_failures, env_values)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    if args.wait_seconds > 0:
        time.sleep(args.wait_seconds)
        delayed_failures = check_once(args.live_config_url, env_values)
        if delayed_failures:
            result = {"ok": False, "phase": "delayed", "wait_seconds": args.wait_seconds, "failures": delayed_failures}
            if not args.no_rollback:
                result["rollback"] = rollback(delayed_failures, env_values)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1

    print(json.dumps({"ok": True, "live_status": 200, "wait_seconds": args.wait_seconds}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
