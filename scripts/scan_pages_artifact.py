#!/usr/bin/env python3
"""Fail closed when a Pages artifact contains credentials or private exports."""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
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
SPLIT_SECRET_PATTERNS = (
    re.compile(rb"[\"']sb_[\"']\s*\+\s*[\"']secret_[\"']"),
    re.compile(rb"[\"']gh[opusr]_[\"']\s*\+\s*[\"'][A-Za-z0-9_]"),
    re.compile(rb"[\"']AIza[\"']\s*\+\s*[\"'][0-9A-Za-z_-]"),
    re.compile(rb"[\"']sk_[\"']\s*\+\s*[\"'](?:live|test)_[\"']"),
)
JWT_PATTERN = re.compile(rb"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
PII_WORDS = re.compile(r"(?:customer|client|contact|inquir|lead|member|user|personal|pii)", re.IGNORECASE)
PII_EXPORT_SUFFIXES = {".csv", ".tsv", ".xls", ".xlsx", ".json", ".jsonl", ".sql", ".db", ".sqlite", ".sqlite3"}
UNAPPROVED_DATA_EXPORT_SUFFIXES = {
    ".csv",
    ".db",
    ".db3",
    ".dump",
    ".mdb",
    ".ods",
    ".sql",
    ".sqlite",
    ".sqlite3",
    ".tsv",
    ".xls",
    ".xlsb",
    ".xlsm",
    ".xlsx",
}
ARCHIVE_SUFFIXES = {
    ".7z",
    ".bz2",
    ".gz",
    ".rar",
    ".tar",
    ".tar.bz2",
    ".tar.gz",
    ".tgz",
    ".xz",
    ".zip",
}
PII_SCHEMA_FIELDS = {
    "address",
    "customer_name",
    "email",
    "full_name",
    "name",
    "phone",
    "phone_number",
}
PRIVATE_KEY_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
PRIVATE_KEY_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}
ARCHIVE_MAGIC_PREFIXES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
    b"\x1f\x8b",
    b"7z\xbc\xaf\x27\x1c",
    b"Rar!\x1a\x07",
    b"\xfd7zXZ\x00",
    b"BZh",
)
DATA_EXPORT_MAGIC_PREFIXES = (
    b"SQLite format 3\x00",
    b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
)
SQL_DUMP_PATTERN = re.compile(
    rb"(?:\bCREATE\s+TABLE\b[\s\S]{0,100000}\bINSERT\s+INTO\b|\bINSERT\s+INTO\b[\s\S]{0,100000}\bCREATE\s+TABLE\b)",
    re.IGNORECASE,
)


def load_allowlist(path: Path) -> dict[str, set[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != 1:
        raise ValueError("unsupported allowlist schema")
    allowlists = {}
    for field in ("supabase_browser_anon_sha256", "google_browser_api_key_sha256"):
        values = data.get(field)
        if not isinstance(values, list) or any(not re.fullmatch(r"[0-9a-f]{64}", value) for value in values):
            raise ValueError("allowlist must contain lowercase SHA-256 digests")
        allowlists[field] = set(values)
    return allowlists


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
    if any(name.endswith(archive_suffix) for archive_suffix in ARCHIVE_SUFFIXES):
        findings.append("unapproved_archive")
    if suffix in UNAPPROVED_DATA_EXPORT_SUFFIXES:
        findings.append("unapproved_data_export")
    normalized = relative.as_posix()
    if suffix in PII_EXPORT_SUFFIXES and PII_WORDS.search(normalized):
        findings.append("pii_export_artifact")
    return findings


def json_contains_pii_schema(value: object) -> bool:
    if isinstance(value, dict):
        fields = {str(key).strip().lower() for key in value}
        if len(fields & PII_SCHEMA_FIELDS) >= 2:
            return True
        return any(json_contains_pii_schema(item) for item in value.values())
    if isinstance(value, list):
        return any(json_contains_pii_schema(item) for item in value)
    return False


def delimited_text_contains_pii_schema(text: str) -> bool:
    if "\n" not in text and "\r" not in text:
        return False
    for delimiter in (",", "\t"):
        rows = []
        try:
            for row in csv.reader(io.StringIO(text[:1_000_000]), delimiter=delimiter):
                rows.append(row)
                if len(rows) == 20:
                    break
        except csv.Error:
            continue
        if len(rows) < 2:
            continue
        fields = {re.sub(r"[\s-]+", "_", field.strip().lower()) for field in rows[0]}
        if len(fields & PII_SCHEMA_FIELDS) < 2:
            continue
        sample = "\n".join(value for row in rows[1:] for value in row)
        if re.search(r"\b[^\s@,]+@[^\s@,]+\.[^\s@,]+\b", sample) or re.search(
            r"\b(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}\b", sample
        ):
            return True
    return False


def decoded_texts(body: bytes) -> list[str]:
    texts = []
    for encoding in ("utf-8-sig", "utf-16", "utf-16le", "utf-16be"):
        try:
            text = body.decode(encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
        if text not in texts:
            texts.append(text)
    return texts


def content_findings(body: bytes, allowlists: dict[str, set[str]]) -> list[str]:
    texts = decoded_texts(body)
    searchable_bodies = [body, *(text.encode("utf-8") for text in texts)]
    findings = []
    if body.startswith(ARCHIVE_MAGIC_PREFIXES) or (len(body) >= 262 and body[257:262] == b"ustar"):
        findings.append("unapproved_archive")
    if body.startswith(DATA_EXPORT_MAGIC_PREFIXES):
        findings.append("unapproved_data_export")
    if any(SQL_DUMP_PATTERN.search(searchable) for searchable in searchable_bodies):
        findings.append("unapproved_data_export")
    findings.extend(
        name
        for name, pattern in TOKEN_PATTERNS.items()
        if name != "google_api_key" and any(pattern.search(searchable) for searchable in searchable_bodies)
    )
    for searchable in searchable_bodies:
        for match in TOKEN_PATTERNS["google_api_key"].finditer(searchable):
            if hashlib.sha256(match.group(0)).hexdigest() not in allowlists["google_browser_api_key_sha256"]:
                findings.append("unallowlisted_google_browser_key")
    if any(pattern.search(searchable) for pattern in SPLIT_SECRET_PATTERNS for searchable in searchable_bodies):
        findings.append("split_secret_construction")
    for decoded in texts:
        if delimited_text_contains_pii_schema(decoded):
            findings.append("pii_export_content")
            break
        try:
            parsed = json.loads(decoded)
        except json.JSONDecodeError:
            parsed = None
        if parsed is not None and json_contains_pii_schema(parsed):
            findings.append("pii_export_content")
            break
    for searchable in searchable_bodies:
        for match in JWT_PATTERN.finditer(searchable):
            token = match.group(0)
            role = jwt_role(token)
            if role == "service_role":
                findings.append("supabase_service_role")
            elif role == "anon":
                digest = hashlib.sha256(token).hexdigest()
                if digest not in allowlists["supabase_browser_anon_sha256"]:
                    findings.append("unallowlisted_supabase_anon")
            else:
                findings.append("jwt_token")
    return findings


def scan(artifact: Path, allowlist: Path) -> dict[str, object]:
    if not artifact.is_dir() or artifact.is_symlink():
        raise ValueError("artifact must be a regular directory")
    allowlists = load_allowlist(allowlist)
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
        rules = sorted(set(path_findings(relative) + content_findings(path.read_bytes(), allowlists)))
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
