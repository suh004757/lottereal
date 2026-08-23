#!/usr/bin/env python3
"""Static-site and Supabase maintenance check for 롯데부동산."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        for attr in ("href", "src"):
            value = attrs_d.get(attr)
            if value:
                self.refs.append((tag, value))


def is_local_ref(ref: str) -> bool:
    if ref.startswith(("http://", "https://", "mailto:", "tel:", "#", "javascript:")):
        return False
    if ref.startswith("data:"):
        return False
    return True


def check_local_links() -> list[str]:
    errors: list[str] = []
    for html in sorted(REPO.glob("**/*.html")):
        if ".git" in html.parts:
            continue
        parser = LinkParser()
        parser.feed(html.read_text(encoding="utf-8", errors="ignore"))
        for _tag, ref in parser.refs:
            path_part = ref.split("?", 1)[0].split("#", 1)[0]
            if not path_part or not is_local_ref(path_part):
                continue
            target = (html.parent / path_part).resolve()
            try:
                target.relative_to(REPO.resolve())
            except ValueError:
                errors.append(f"{html.relative_to(REPO)} -> outside repo: {ref}")
                continue
            if not target.exists():
                errors.append(f"{html.relative_to(REPO)} -> missing {ref}")
    return errors


def check_js_syntax() -> list[str]:
    errors: list[str] = []
    node = subprocess.run(["bash", "-lc", "command -v node"], text=True, capture_output=True)
    if node.returncode != 0:
        return ["node not available; skipped JS syntax check"]
    for js in sorted((REPO / "js").glob("**/*.js")):
        result = subprocess.run(["node", "--check", str(js)], text=True, capture_output=True, timeout=20)
        if result.returncode != 0:
            errors.append(f"node --check failed: {js.relative_to(REPO)}: {result.stderr.strip()[:300]}")
    return errors


def check_supabase() -> dict:
    helper = REPO / "scripts" / "lottereal_supabase.py"
    result = subprocess.run([sys.executable, str(helper), "health"], text=True, capture_output=True, timeout=45)
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip()[:500]}
    data = json.loads(result.stdout)
    return {"ok": all(item.get("ok") for item in data.values()), "tables": data}


def main() -> int:
    link_errors = check_local_links()
    js_errors = check_js_syntax()
    supabase = check_supabase()
    report = {
        "ok": not link_errors and not js_errors and supabase.get("ok"),
        "link_errors": link_errors[:50],
        "js_errors": js_errors[:50],
        "supabase": supabase,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
