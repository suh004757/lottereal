#!/usr/bin/env python3
"""Fail closed when a Pages artifact contains credentials or private exports."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
from pathlib import Path


TOKEN_PATTERNS = {
    "github_token": re.compile(rb"\b(?:gh[opusr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b"),
    "aws_access_key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "slack_token": re.compile(rb"xox[baprs]-[A-Za-z0-9-]{20,255}"),
    "stripe_secret_key": re.compile(rb"\bsk_(?:live|test)_[A-Za-z0-9]{16,255}\b"),
    "google_api_key": re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b"),
    "supabase_secret_key": re.compile(rb"\bsb_secret_[A-Za-z0-9_-]{16,255}\b"),
    "bearer_token": re.compile(rb"\bBearer[ \t]+[A-Za-z0-9._~+/=-]{20,2048}\b", re.IGNORECASE),
    "database_url": re.compile(rb"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^/@:\s]+:[^/@\s]+@", re.IGNORECASE),
    "private_key_content": re.compile(rb"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----"),
}
JWT_PATTERN = re.compile(rb"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
PII_WORDS = re.compile(r"(?:customer|client|contact|inquir|lead|member|user|personal|pii)", re.IGNORECASE)
PII_EXPORT_SUFFIXES = {".csv", ".tsv", ".xls", ".xlsx", ".json", ".jsonl", ".sql", ".db", ".sqlite", ".sqlite3"}
PRIVATE_KEY_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
PRIVATE_KEY_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}


def load_allowlist(path: Path) -> set[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != 1:
        raise ValueError("unsupported allowlist schema")
    values = data.get("supabase_browser_anon_sha256")
    if not isinstance(values, list) or any(not re.fullmatch(r"[0-9a-f]{64}", value) for value in values):
        raise ValueError("allowlist must contain lowercase SHA-256 digests")
    return set(values)


def jwt_role(token: bytes) -> str | None:
    try:
        payload = token.split(b".", 2)[1]
        payload += b"=" * (-len(payload) % 4)
        value = json.loads(base64.urlsafe_b64decode(payload))
        role = value.get("role")
        return role if isinstance(role, str) else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def path_findings(relative: Path) -> list[str]:
    name = relative.name.lower()
    suffix = relative.suffix.lower()
    findings = []
    if name == ".env" or name.startswith(".env.") or name.endswith(".env"):
        findings.append("environment_file")
    if name in PRIVATE_KEY_NAMES or suffix in PRIVATE_KEY_SUFFIXES:
        findings.append("private_key_artifact")
    normalized = relative.as_posix()
    if suffix in PII_EXPORT_SUFFIXES and PII_WORDS.search(normalized):
        findings.append("pii_export_artifact")
    return findings


def content_findings(body: bytes, allowed_anon_hashes: set[str]) -> list[str]:
    findings = [name for name, pattern in TOKEN_PATTERNS.items() if pattern.search(body)]
    for match in JWT_PATTERN.finditer(body):
        token = match.group(0)
        role = jwt_role(token)
        if role == "service_role":
            findings.append("supabase_service_role")
        elif role == "anon":
            digest = hashlib.sha256(token).hexdigest()
            if digest not in allowed_anon_hashes:
                findings.append("unallowlisted_supabase_anon")
        else:
            findings.append("jwt_token")
    return findings


def scan(artifact: Path, allowlist: Path) -> dict[str, object]:
    if not artifact.is_dir() or artifact.is_symlink():
        raise ValueError("artifact must be a regular directory")
    allowed_anon_hashes = load_allowlist(allowlist)
    findings = []
    files_scanned = 0
    for path in sorted(artifact.rglob("*")):
        relative = path.relative_to(artifact)
        if path.is_symlink():
            findings.append({"path": relative.as_posix(), "rules": ["symlink_artifact"]})
            continue
        if not path.is_file():
            continue
        files_scanned += 1
        rules = sorted(set(path_findings(relative) + content_findings(path.read_bytes(), allowed_anon_hashes)))
        if rules:
            findings.append({"path": relative.as_posix(), "rules": rules})
    return {"ok": not findings, "files_scanned": files_scanned, "findings": findings}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--allowlist", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = scan(args.artifact, args.allowlist)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__}, sort_keys=True))
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
