#!/usr/bin/env python3
"""Rebuild or validate optimized WebP assets from webp_manifest.json."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path(__file__).with_name("webp_manifest.json")


def webp_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError(f"not WebP: {path}")
    kind = data[12:16]
    if kind == b"VP8X":
        return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
    if kind == b"VP8 ":
        marker = data.index(b"\x9d\x01\x2a", 20)
        width, height = struct.unpack_from("<HH", data, marker + 3)
        return width & 0x3FFF, height & 0x3FFF
    if kind == b"VP8L":
        _, b1, b2, b3 = data[21:25]
        return 1 + (((b2 & 0x3F) << 8) | b1), 1 + ((b3 << 6) | (b2 >> 6))
    raise ValueError(f"unsupported WebP encoding: {path}")


def require_cwebp_version(executable: str, required: str) -> None:
    result = subprocess.run([executable, "-version"], check=True, text=True, capture_output=True)
    actual = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""
    if actual != required:
        raise RuntimeError(f"cwebp version mismatch: required {required}, found {actual or 'unknown'}")


def validate_output(path: Path, item: dict) -> None:
    expected_dimensions = item["width"], item["height"]
    if not path.is_file() or webp_dimensions(path) != expected_dimensions:
        raise RuntimeError(f"invalid generated WebP: {path} (expected {expected_dimensions})")
    actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_hash != item["sha256"]:
        raise RuntimeError(f"WebP sha256 mismatch: {path} (expected {item['sha256']}, found {actual_hash})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate committed outputs without running cwebp")
    args = parser.parse_args(argv)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    executable = shutil.which(manifest["tool"])
    if not args.check and not executable:
        parser.error("cwebp is required; install libwebp tools")
    if executable:
        require_cwebp_version(executable, manifest["required_version"])
    for item in manifest["images"]:
        source = ROOT / item["source"]
        output = ROOT / item["output"]
        expected = item["width"], item["height"]
        if not source.is_file():
            raise FileNotFoundError(source)
        if not args.check:
            output.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.", suffix=".tmp", dir=output.parent)
            os.close(descriptor)
            temporary = Path(temporary_name)
            try:
                command = [executable, *manifest["defaults"], "-resize", str(expected[0]), str(expected[1]), str(source), "-o", str(temporary)]
                subprocess.run(command, check=True)
                validate_output(temporary, item)
                os.replace(temporary, output)
            finally:
                temporary.unlink(missing_ok=True)
        validate_output(output, item)
    print(json.dumps({
        "ok": True, "checked": args.check, "images": len(manifest["images"]),
        "encoder_verified": bool(executable),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
