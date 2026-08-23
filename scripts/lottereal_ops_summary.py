#!/usr/bin/env python3
"""Low-token daily ops summary for LotteReal.

Aggregates repetitive checks into one compact JSON output:
- git status cleanliness for tracked site changes;
- Supabase health;
- GA/Search Console summaries when credentials are configured;
- listing counts and stale listing age hints;
- public-surface forbidden-term scan.

Secrets are loaded from /opt/data/.env but never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from lottereal_supabase import health, load_env, supabase_request

REPO = Path(__file__).resolve().parents[1]
FORBIDDEN_PUBLIC_PATTERNS = [
    "BEGIN " + "PRIVATE KEY",
    "private" + "_key_id",
    "hermes" + "-lotte@",
    "named" + "-tome",
    "MII" + "EvgIB",
    "API" + " key",
    "API" + " 키",
    "M" + "CP",
    "Open" + "API",
    "STAT" + "BL",
    "M" + "ST",
    "ef" + "Yd",
]


def run(cmd: list[str], timeout: int = 120) -> dict[str, Any]:
    proc = subprocess.run(cmd, cwd=REPO, text=True, capture_output=True, timeout=timeout)
    return {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }


def git_status() -> dict[str, Any]:
    res = run(["git", "status", "--short", "--branch"])
    lines = res["stdout"].splitlines()
    return {"ok": res["ok"], "branch": lines[0] if lines else "", "dirty_lines": lines[1:]}


def public_scan() -> dict[str, Any]:
    matches: list[dict[str, str]] = []
    for path in REPO.rglob("*"):
        if path.suffix.lower() not in {".html", ".js", ".json", ".xml"}:
            continue
        if ".git" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in FORBIDDEN_PUBLIC_PATTERNS:
            if pattern in text:
                matches.append({"file": str(path.relative_to(REPO)), "pattern": pattern})
    return {"ok": not matches, "matches": matches[:20], "count": len(matches)}


def listing_summary(env: dict[str, str]) -> dict[str, Any]:
    select = "id,title,created_at,property_type,address,city,district,price"
    _, rows = supabase_request("GET", "property_listings", env, query=f"?select={select}&order=created_at.desc&limit=20")
    rows = list(rows or [])
    now = datetime.now(timezone.utc)
    stale: list[dict[str, Any]] = []
    for row in rows:
        created = row.get("created_at")
        age_days = None
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                age_days = (now - dt).days
            except ValueError:
                pass
        if age_days is not None and age_days >= 21:
            stale.append({"id": row.get("id"), "title": row.get("title"), "age_days": age_days})
    return {
        "count_sample": len(rows),
        "latest_titles": [r.get("title") for r in rows[:5]],
        "stale_review_candidates": stale[:10],
        "note": "고정 노출기간보다 상태 확인이 핵심. 한국부동산원은 거래완료 인터넷 표시·광고 삭제 여부를 모니터링하며, 계약 완료·거래 불가 매물은 허위/미끼매물이 되지 않도록 지체없이 노출 종료 검토. stale_review_candidates는 법정 만료일이 아니라 운영상 재확인 후보.",
    }


def analytics_summary() -> dict[str, Any]:
    helper = REPO / "scripts" / "lottereal_google_analytics.py"
    if not helper.exists():
        return {"ok": False, "reason": "helper_missing"}
    env = load_env()
    if not (env.get("LOTTEREAL_GOOGLE_APPLICATION_CREDENTIALS") and env.get("LOTTEREAL_GA4_PROPERTY_ID")):
        return {"ok": False, "reason": "analytics_env_missing"}
    out: dict[str, Any] = {}
    ga = run(["uv", "run", "--with", "google-auth", "--with", "requests", "python3", str(helper), "ga-summary", "--start-date", "30daysAgo", "--end-date", "today", "--limit", "5"], timeout=240)
    out["ga"] = json.loads(ga["stdout"]) if ga["ok"] and ga["stdout"].startswith("{") else {"ok": False, "error": ga["stderr"][:200]}
    gsc = run(["uv", "run", "--with", "google-auth", "--with", "requests", "python3", str(helper), "gsc-query", "--start-date", "30daysAgo", "--end-date", "today", "--dimensions", "query,page", "--limit", "10"], timeout=240)
    out["gsc"] = json.loads(gsc["stdout"]) if gsc["ok"] and gsc["stdout"].startswith("{") else {"ok": False, "error": gsc["stderr"][:200]}
    return {"ok": True, **out}


def build_summary(include_analytics: bool) -> dict[str, Any]:
    env = load_env()
    summary = {
        "ok": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git": git_status(),
        "supabase_health": health(env),
        "listings": listing_summary(env),
        "public_scan": public_scan(),
    }
    if include_analytics:
        summary["analytics"] = analytics_summary()
    summary["ok"] = bool(summary["git"].get("ok") and summary["public_scan"].get("ok") and all(v.get("ok") for v in summary["supabase_health"].values()))
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Compact LotteReal ops summary")
    parser.add_argument("--with-analytics", action="store_true")
    parser.add_argument("--save", type=Path, help="Optional JSON output path")
    args = parser.parse_args()
    summary = build_summary(include_analytics=args.with_analytics)
    text = json.dumps(summary, ensure_ascii=False, indent=2)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(text, encoding="utf-8")
    print(text)
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
