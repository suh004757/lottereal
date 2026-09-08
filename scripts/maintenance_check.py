#!/usr/bin/env python3
"""Static-site and Supabase maintenance check for 롯데부동산."""
from __future__ import annotations

import hashlib
import json
import os
import re
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
VENDOR_SHA256 = {
    "js/vendor/dompurify-3.4.15.min.js": "f263b05369e050fa175d4ecb9c9358eb4253602d510297adfb31df48b2f1c4d5",
    "js/vendor/marked-18.0.11.min.js": "69451c8541c9c1e7a4bf3ffc6f73c4d89633de92bfbe3e484dfe182ef8091f88",
}
ALLOWED_JSDELIVR_URLS = {
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.65.0/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/functions-js@2.4.1/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/node-fetch@2.6.15/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@1.16.1/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/realtime-js@2.10.2/+esm",
    "https://cdn.jsdelivr.net/npm/@supabase/storage-js@2.7.0/+esm",
    "https://cdn.jsdelivr.net/npm/ws@8.17.1/+esm",
}
JSDELIVR_CSP_SOURCES = " ".join(sorted(ALLOWED_JSDELIVR_URLS))
FORBIDDEN_DEPENDENCY_FILES = (
    "js/plugins.js",
    "js/active.js",
    "js/jquery/jquery-3.7.1.min.js",
    "css/animate.css",
    "css/owl.carousel.css",
    "css/magnific-popup.css",
    "css/font-awesome.min.css",
    "css/themify-icons.css",
)
FORBIDDEN_DEPENDENCY_BASENAMES = {
    "plugins.js",
    "active.js",
    "jquery-3.7.1.min.js",
}
FORBIDDEN_DEPENDENCY_REFS = (
    "js/jquery/",
    "js/bootstrap.min.js",
    "js/popper.min.js",
    "simplemde",
    "cdn.jsdelivr.net/npm/dompurify",
    "cdn.jsdelivr.net/npm/marked",
)
PUBLIC_CSP = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; "
    f"script-src 'self' {JSDELIVR_CSP_SOURCES} https://www.googletagmanager.com; script-src-attr 'none'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co "
    "https://www.google-analytics.com https://region1.google-analytics.com; form-action 'self'; upgrade-insecure-requests"
)
ADMIN_CSP = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; "
    f"script-src 'self' {JSDELIVR_CSP_SOURCES}; script-src-attr 'none'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co; "
    "form-action 'self'; upgrade-insecure-requests"
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


def check_vendor_integrity() -> list[str]:
    errors: list[str] = []
    for relative, expected_hash in VENDOR_SHA256.items():
        path = REPO / relative
        if not path.is_file():
            errors.append(f"missing pinned vendor asset: {relative}")
            continue
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            errors.append(f"vendor hash mismatch: {relative}")

    for relative in FORBIDDEN_DEPENDENCY_FILES:
        if (REPO / relative).exists():
            errors.append(f"forbidden dependency file: {relative}")

    authored_sources = sorted(
        list(REPO.glob("**/*.html"))
        + list((REPO / "js").glob("**/*.js"))
        + list((REPO / "js").glob("**/*.mjs"))
        + list(REPO.glob("**/*.css"))
    )
    for source_path in authored_sources:
        if ".git" in source_path.parts or "vendor" in source_path.parts:
            continue
        source = source_path.read_text(encoding="utf-8", errors="ignore")
        source_lower = source.lower()
        for marker in FORBIDDEN_DEPENDENCY_REFS:
            if marker in source_lower:
                errors.append(f"forbidden dependency reference: {source_path.relative_to(REPO)} -> {marker}")
        for quoted_ref in re.findall(r"[\"']([^\"']+)[\"']", source):
            clean_ref = re.split(r"[?#]", quoted_ref, maxsplit=1)[0].replace("\\", "/")
            basename = clean_ref.rsplit("/", 1)[-1].lower()
            if basename in FORBIDDEN_DEPENDENCY_BASENAMES:
                errors.append(f"forbidden dependency reference: {source_path.relative_to(REPO)} -> {quoted_ref}")
        raw_jsdelivr_urls = set(re.findall(r"(?:(?:https:)?//)cdn\.jsdelivr\.net/[^\s\"'`<>]+", source))
        jsdelivr_urls = {url.rstrip(";,)>") for url in raw_jsdelivr_urls}
        for url in sorted(jsdelivr_urls - ALLOWED_JSDELIVR_URLS):
            errors.append(f"unexpected jsDelivr executable: {source_path.relative_to(REPO)} -> {url}")
        residual_source = source
        for url in raw_jsdelivr_urls:
            residual_source = residual_source.replace(url, "")
        if re.search(r"jsdelivr\s*\.\s*net", residual_source, re.IGNORECASE):
            errors.append(f"constructed jsDelivr reference: {source_path.relative_to(REPO)}")
    return errors


def check_html_security_policy() -> list[str]:
    errors: list[str] = []
    verification_file = "naver8cf28dd9c8569f7f73da84b1adf5a2fb.html"
    redirect_file = REPO / "redirect" / "zigbang-inquiry.html"
    for html in sorted(REPO.glob("**/*.html")):
        if ".git" in html.parts or html.name == verification_file:
            continue
        relative = html.relative_to(REPO)
        source = html.read_text(encoding="utf-8", errors="ignore")
        if html == redirect_file:
            if "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'" not in source:
                errors.append(f"redirect CSP missing or weakened: {relative}")
            if '<meta name="referrer" content="no-referrer">' not in source:
                errors.append(f"redirect referrer policy missing: {relative}")
        else:
            expected = ADMIN_CSP if html.parent == REPO / "admin" else PUBLIC_CSP
            marker = f'<meta http-equiv="Content-Security-Policy" content="{expected}">'
            referrer_marker = '<meta name="referrer" content="strict-origin-when-cross-origin">'
            first_script = re.search(r"<script\b", source, re.IGNORECASE)
            first_external = re.search(
                r"<(?:script\b[^>]*\bsrc\s*=|link\b[^>]*\bhref\s*=|img\b[^>]*\bsrc\s*=|iframe\b[^>]*\bsrc\s*=)",
                source,
                re.IGNORECASE,
            )
            head = re.search(r"<head\b[^>]*>.*?</head\s*>", source, re.IGNORECASE | re.DOTALL)
            if marker not in source:
                errors.append(f"CSP missing or changed: {relative}")
            elif not head or marker not in head.group(0):
                errors.append(f"CSP must be inside head: {relative}")
            elif first_script and source.index(marker) > first_script.start():
                errors.append(f"CSP appears after a script: {relative}")
            if marker in source and first_external and source.index(marker) > first_external.start():
                errors.append(f"CSP appears after an external resource: {relative}")
            if referrer_marker not in source:
                errors.append(f"referrer policy missing: {relative}")
            elif not head or referrer_marker not in head.group(0):
                errors.append(f"referrer policy must be inside head: {relative}")
            elif first_external and source.index(referrer_marker) > first_external.start():
                errors.append(f"referrer policy appears after an external resource: {relative}")

        if re.search(r"\son[a-z]+\s*=", source, re.IGNORECASE):
            errors.append(f"inline event handler present: {relative}")
        if 'type="importmap"' in source:
            errors.append(f"inline importmap present: {relative}")
        for attrs, body in re.findall(r"<script\b([^>]*)>(.*?)</script\s*>", source, re.IGNORECASE | re.DOTALL):
            if re.search(r"\bsrc\s*=", attrs, re.IGNORECASE):
                continue
            script_type = re.search(r"\btype=[\"']([^\"']+)", attrs, re.IGNORECASE)
            if script_type and script_type.group(1).lower() == "application/ld+json":
                continue
            if body.strip():
                errors.append(f"executable inline script present: {relative}")
                break
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
    vendor_errors = check_vendor_integrity()
    security_policy_errors = check_html_security_policy()
    supabase = check_supabase()
    report = {
        "ok": not link_errors and not js_errors and not vendor_errors and not security_policy_errors and supabase.get("ok"),
        "link_errors": link_errors[:50],
        "js_errors": js_errors[:50],
        "vendor_errors": vendor_errors[:50],
        "security_policy_errors": security_policy_errors[:50],
        "supabase": supabase,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
