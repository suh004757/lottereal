#!/usr/bin/env python3
"""Verify that the exact built GitHub Pages artifact is healthy and live."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import time
from pathlib import PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


SHA256 = re.compile(r"[0-9a-f]{64}")
REVISION = re.compile(r"[0-9a-f]{40}")


def safe_manifest_path(value: str) -> bool:
    path = PurePosixPath(value)
    return bool(value) and not value.startswith("/") and "\\" not in value and all(part not in {"", ".", ".."} for part in path.parts)


def fetch(base_url: str, path: str, revision: str, attempt: int) -> tuple[int | None, bytes, str | None]:
    encoded_path = "/".join(quote(part, safe="") for part in PurePosixPath(path).parts)
    query = urlencode({"revision": revision, "attempt": attempt})
    url = urljoin(base_url.rstrip("/") + "/", encoded_path) + "?" + query
    request = Request(url, headers={"User-Agent": "LotteReal-PagesVerifier", "Cache-Control": "no-cache, no-store"})
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, response.read(), None
    except HTTPError as exc:
        return exc.code, b"", f"http_{exc.code}"
    except (URLError, TimeoutError, OSError) as exc:
        return None, b"", type(exc).__name__


def validate_manifest(body: bytes, expected_revision: str) -> tuple[dict[str, dict[str, object]] | None, str | None]:
    try:
        manifest = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, "invalid_manifest_json"
    if manifest.get("schema") != 2:
        return None, "invalid_manifest_schema"
    if manifest.get("revision") != expected_revision:
        return None, "revision_mismatch"
    files = manifest.get("files")
    if not isinstance(files, dict) or "index.html" not in files:
        return None, "invalid_manifest_files"
    checked: dict[str, dict[str, object]] = {}
    for path, metadata in files.items():
        if not isinstance(path, str) or not safe_manifest_path(path):
            return None, "unsafe_manifest_path"
        if not isinstance(metadata, dict):
            return None, "invalid_manifest_metadata"
        digest = metadata.get("sha256")
        size = metadata.get("bytes")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest) or not isinstance(size, int) or size < 0:
            return None, "invalid_manifest_metadata"
        checked[path] = metadata
    return checked, None


def verify_file(base_url: str, expected_revision: str, attempt: int, item: tuple[str, dict[str, object]]) -> dict[str, object] | None:
    path, metadata = item
    status, body, fetch_error = fetch(base_url, path, expected_revision, attempt)
    if status != 200:
        return {"ok": False, "check": "file_status", "path": path, "status": status, "error": fetch_error}
    if len(body) != metadata["bytes"]:
        return {"ok": False, "check": "bytes_mismatch", "path": path}
    if hashlib.sha256(body).hexdigest() != metadata["sha256"]:
        return {"ok": False, "check": "sha256_mismatch", "path": path}
    return None


def verify_once(base_url: str, expected_revision: str, expected_manifest_sha256: str, attempt: int) -> dict[str, object]:
    status, manifest_body, error = fetch(base_url, "pages-manifest.json", expected_revision, attempt)
    if status != 200:
        return {"ok": False, "check": "manifest_status", "status": status, "error": error}
    if hashlib.sha256(manifest_body).hexdigest() != expected_manifest_sha256:
        return {"ok": False, "check": "manifest_sha256_mismatch"}
    files, error = validate_manifest(manifest_body, expected_revision)
    if error:
        return {"ok": False, "check": error}
    assert files is not None
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        results = executor.map(
            lambda item: verify_file(base_url, expected_revision, attempt, item),
            files.items(),
        )
        for failure in results:
            if failure:
                return failure
    return {"ok": True, "revision": expected_revision, "files_verified": len(files), "health": "ok"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--expected-revision", required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--retry-seconds", type=float, default=15)
    args = parser.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        parser.error("base URL must be HTTP(S)")
    if not REVISION.fullmatch(args.expected_revision):
        parser.error("expected revision must be a lowercase full commit SHA")
    if not SHA256.fullmatch(args.expected_manifest_sha256):
        parser.error("expected manifest digest must be lowercase SHA-256")
    if args.attempts < 1 or args.retry_seconds < 0:
        parser.error("retry settings are invalid")

    result: dict[str, object] = {"ok": False, "check": "not_run"}
    for attempt in range(1, args.attempts + 1):
        result = verify_once(args.base_url, args.expected_revision, args.expected_manifest_sha256, attempt)
        if result["ok"]:
            print(json.dumps(result, sort_keys=True))
            return 0
        if attempt < args.attempts:
            time.sleep(args.retry_seconds)
    result["attempts"] = args.attempts
    print(json.dumps(result, sort_keys=True))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
