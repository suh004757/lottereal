#!/usr/bin/env python3
"""Static-site and Supabase maintenance check for 롯데부동산."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[1]

PUBLIC_CONTENT_HTML = (
    REPO / "report.html",
    REPO / "disputes.html",
)
PUBLIC_CONTENT_JS = (
    REPO / "js" / "reportPage.js",
    REPO / "js" / "reportLandingPage.js",
    REPO / "js" / "utils" / "reportDates.mjs",
)


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


def check_local_links(paths=None) -> list[str]:
    errors: list[str] = []
    html_paths = paths if paths is not None else REPO.glob("**/*.html")
    for html in sorted(html_paths):
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


def check_js_syntax(paths=None) -> list[str]:
    errors: list[str] = []
    node = subprocess.run(["bash", "-lc", "command -v node"], text=True, capture_output=True)
    if node.returncode != 0:
        return ["node not available; skipped JS syntax check"]
    js_paths = paths if paths is not None else (REPO / "js").glob("**/*.js")
    for js in sorted(js_paths):
        result = subprocess.run(["node", "--check", str(js)], text=True, capture_output=True, timeout=20)
        if result.returncode != 0:
            errors.append(f"node --check failed: {js.relative_to(REPO)}: {result.stderr.strip()[:300]}")
    return errors


def check_public_market_reports() -> dict:
    values: dict[str, str] = {}
    env_path = Path("/opt/data/.env")
    try:
        env_lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: public Supabase configuration unavailable"}
    for line in env_lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {"SUPABASE_URL", "SUPABASE_ANON_KEY"}:
            values[key] = value.strip().strip('"').strip("'")
    url = values.get("SUPABASE_URL", "").rstrip("/")
    anon_key = values.get("SUPABASE_ANON_KEY", "")
    if not url or not anon_key:
        return {"ok": False, "error": "public Supabase configuration unavailable"}
    query = urlencode({"select": "slug", "status": "eq.published", "limit": "1"})
    request = Request(
        f"{url}/rest/v1/market_reports?{query}",
        headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            rows = json.loads(response.read().decode("utf-8"))
            table = {"ok": response.status == 200, "status": response.status, "sample_rows": len(rows)}
            return {"ok": table["ok"], "tables": {"market_reports": table}}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: public market_reports probe failed"}


def check_supabase() -> dict:
    if os.environ.get("LOTTEREAL_PUBLIC_CONTENT_ONLY") == "1":
        return check_public_market_reports()
    helper = REPO / "scripts" / "lottereal_supabase.py"
    command = [sys.executable, str(helper), "health"]
    result = subprocess.run(command, text=True, capture_output=True, timeout=45)
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr.strip()[:500]}
    data = json.loads(result.stdout)
    return {"ok": all(item.get("ok") for item in data.values()), "tables": data}


def main() -> int:
    public_content_only = os.environ.get("LOTTEREAL_PUBLIC_CONTENT_ONLY") == "1"
    link_errors = check_local_links(PUBLIC_CONTENT_HTML if public_content_only else None)
    js_errors = check_js_syntax(PUBLIC_CONTENT_JS if public_content_only else None)
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
