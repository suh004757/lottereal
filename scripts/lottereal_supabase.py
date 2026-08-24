#!/usr/bin/env python3
"""Supabase helper for 롯데부동산 site content.

Reads secrets from /opt/data/.env by default. Does not print secret values.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ENV_PATH = Path(os.environ.get("LOTTEREAL_ENV", "/opt/data/.env"))


def load_env(path: Path = ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k.startswith("SUPABASE_")})
    return values


def supabase_request(method: str, table: str, env: dict[str, str], payload=None, query: str = ""):
    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and a Supabase key are required")
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        f"{url}/rest/v1/{table}{query}",
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
            "User-Agent": "Hermes-LotteReal-Ops",
        },
    )
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase {method} {table} failed: HTTP {exc.code} {detail}") from exc


REQUIRED_REPORT_SECTIONS = (
    "## 먼저 볼 내용",
    "## 확인된 흐름",
    "## 상담 전에 확인할 점",
    "## 자료와 한계",
)

AI_STYLE_PHRASES = (
    "Executive Summary",
    "결론 및 전략적 시사점",
    "포지션별 행동 지침",
    "시나리오 매트릭스",
    "Let me know",
    "I hope this helps",
)

EMOJI_PATTERN = re.compile("[✅⚠️📌📊🏠💡🚀🔍📋📉📈]")


def validate_report_copy(report: dict) -> list[str]:
    """Return public-copy problems that should block a report upsert."""
    errors: list[str] = []
    title = str(report.get("title") or "").strip()
    summary = str(report.get("summary") or "").strip()
    report_md = str(report.get("report_md") or "")
    evidence = report.get("evidence_json") or []

    if not title:
        errors.append("title is required")
    if not 30 <= len(summary) <= 240:
        errors.append("summary must be 30-240 characters")
    for section in REQUIRED_REPORT_SECTIONS:
        if section not in report_md:
            errors.append(f"required section missing: {section}")
    if not isinstance(evidence, list) or len(evidence) < 2:
        errors.append("at least two sources are required")
    for source in evidence if isinstance(evidence, list) else []:
        if not isinstance(source, dict) or not source.get("name") or not source.get("url"):
            errors.append("each source requires name and url")
            break

    combined = "\n".join((title, summary, report_md))
    for phrase in AI_STYLE_PHRASES:
        if phrase.lower() in combined.lower():
            errors.append(f"AI-style phrase is not allowed: {phrase}")
    if "—" in combined:
        errors.append("em dash is not allowed in public report copy")
    if EMOJI_PATTERN.search(combined):
        errors.append("emoji is not allowed in public report copy")
    return errors


def upsert_report(report: dict, env: dict[str, str]):
    required = ["slug", "title", "summary", "report_md"]
    missing = [key for key in required if not report.get(key)]
    if missing:
        raise ValueError(f"missing required report fields: {', '.join(missing)}")
    copy_errors = validate_report_copy(report)
    if copy_errors:
        raise ValueError("report copy validation failed: " + "; ".join(copy_errors))
    payload = {
        "slug": report["slug"],
        "title": report["title"],
        "summary": report.get("summary", ""),
        "report_md": report.get("report_md", ""),
        "evidence_json": report.get("evidence_json", []),
        "status": report.get("status", "published"),
        "metadata": report.get("metadata", {}),
    }
    status, data = supabase_request(
        "POST",
        "market_reports",
        env,
        payload,
        query="?on_conflict=slug",
    )
    return status, data



def upsert_feed(feed: dict, env: dict[str, str]):
    required = ["source", "title", "url"]
    missing = [key for key in required if not feed.get(key)]
    if missing:
        raise ValueError(f"missing required feed fields: {', '.join(missing)}")
    payload = {
        "source": feed["source"],
        "title": feed["title"],
        "url": feed["url"],
        "summary": feed.get("summary", ""),
        "published_at": feed.get("published_at"),
        "fetched_at": feed.get("fetched_at"),
    }
    query_url = quote(feed["url"], safe="")
    status, existing = supabase_request(
        "GET",
        "external_feeds",
        env,
        query=f"?select=id&url=eq.{query_url}&limit=1",
    )
    if existing:
        feed_id = quote(existing[0]["id"], safe="")
        return supabase_request("PATCH", "external_feeds", env, payload, query=f"?id=eq.{feed_id}")
    return supabase_request("POST", "external_feeds", env, payload)

def health(env: dict[str, str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for table in ["market_reports", "property_listings", "inquiries", "external_feeds"]:
        try:
            status, data = supabase_request("GET", table, env, query="?select=*&limit=1")
            out[table] = {"ok": True, "status": status, "sample_rows": len(data or [])}
        except Exception as exc:  # noqa: BLE001 - CLI diagnostic
            out[table] = {"ok": False, "error": type(exc).__name__}
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="롯데부동산 Supabase ops helper")
    sub = parser.add_subparsers(dest="cmd", required=True)
    upsert = sub.add_parser("upsert-report")
    upsert.add_argument("json_path", type=Path)
    feed_upsert = sub.add_parser("upsert-feed")
    feed_upsert.add_argument("json_path", type=Path)
    sub.add_parser("health")
    args = parser.parse_args()
    env = load_env()
    if args.cmd == "health":
        print(json.dumps(health(env), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "upsert-report":
        report = json.loads(args.json_path.read_text(encoding="utf-8"))
        status, data = upsert_report(report, env)
        rows = len(data or []) if isinstance(data, list) else int(bool(data))
        print(json.dumps({"ok": True, "status": status, "rows": rows, "slug": report.get("slug")}, ensure_ascii=False))
        return 0
    if args.cmd == "upsert-feed":
        feed = json.loads(args.json_path.read_text(encoding="utf-8"))
        status, data = upsert_feed(feed, env)
        rows = len(data or []) if isinstance(data, list) else int(bool(data))
        print(json.dumps({"ok": True, "status": status, "rows": rows, "url": feed.get("url")}, ensure_ascii=False))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
