#!/usr/bin/env python3
"""Silent inquiry watchdog for LotteReal.

Prints a Discord-ready message only when there are newly submitted inquiries.
Keeps state outside the public repo under /opt/data/state/lottereal/.
Does not print Supabase credentials or full personal data.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import os
import re

from lottereal_supabase import load_env, supabase_request

STATE_PATH = Path("/opt/data/state/lottereal/inquiry_watch_state.json")
DEFAULT_LIMIT = 10


def load_state(path: Path = STATE_PATH) -> dict:
    if not path.exists():
        return {"seen_ids": [], "last_checked_at": None}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"seen_ids": [], "last_checked_at": None}


def save_state(state: dict, path: Path = STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_recent_inquiries(limit: int = DEFAULT_LIMIT) -> list[dict]:
    env = load_env()
    select = "id,created_at,status,listing_id,listing_title,name,phone,email,message"
    query = f"?select={select}&order=created_at.desc&limit={int(limit)}"
    _, data = supabase_request("GET", "inquiries", env, query=query)
    return list(data or [])


def mask_phone(value: str | None) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) <= 4:
        return digits or "미기재"
    return f"***-****-{digits[-4:]}"


def compact(value: str | None, max_len: int = 80) -> str:
    text = " ".join(str(value or "").split())
    if not text:
        return "미기재"
    return text if len(text) <= max_len else f"{text[:max_len - 1]}…"


def configured_mention(values: dict[str, str] | None = None) -> str:
    values = values or load_env()
    mention = values.get("LOTTEREAL_INQUIRY_MENTION") or os.environ.get("LOTTEREAL_INQUIRY_MENTION") or ""
    return mention if re.fullmatch(r"<@!?\d+>", mention) else ""


def format_message(new_items: list[dict], mention: str | None = None) -> str:
    mention = configured_mention() if mention is None else mention
    prefix = f"{mention} " if mention else ""
    lines = [f"{prefix}롯데부동산 새 문의가 들어왔습니다."]
    for idx, item in enumerate(new_items[:5], 1):
        created = item.get("created_at") or "시간 미기재"
        listing = compact(item.get("listing_title") or item.get("listing_id") or "일반 문의", 60)
        name = compact(item.get("name"), 24)
        phone = mask_phone(item.get("phone"))
        msg = compact(item.get("message"), 120)
        lines.extend([
            "",
            f"{idx}. {listing}",
            f"- 접수: {created}",
            f"- 이름: {name}",
            f"- 연락처: {phone}",
            f"- 요청: {msg}",
        ])
    if len(new_items) > 5:
        lines.append(f"\n외 {len(new_items) - 5}건 추가 문의가 있습니다. Supabase/admin에서 확인하세요.")
    return "\n".join(lines)


def run(limit: int, init_only: bool = False) -> str:
    state = load_state()
    seen = set(state.get("seen_ids") or [])
    items = fetch_recent_inquiries(limit=limit)
    ids = [str(item.get("id")) for item in items if item.get("id")]

    if init_only or not state.get("last_checked_at"):
        state["seen_ids"] = ids[:200]
        state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
        save_state(state)
        return ""

    new_items = [item for item in reversed(items) if str(item.get("id")) not in seen and item.get("id")]
    if not new_items:
        state["seen_ids"] = list(dict.fromkeys(ids + list(seen)))[:200]
        state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
        save_state(state)
        return ""

    state["seen_ids"] = list(dict.fromkeys(ids + list(seen)))[:200]
    state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
    save_state(state)
    return format_message(new_items, mention=configured_mention())


def main() -> int:
    parser = argparse.ArgumentParser(description="Notify on new LotteReal inquiries; silent when none.")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--init-only", action="store_true", help="Record current inquiries as already seen and print nothing.")
    args = parser.parse_args()
    message = run(limit=args.limit, init_only=args.init_only)
    if message:
        print(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
