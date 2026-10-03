#!/usr/bin/env python3
"""Build the exact static artifact uploaded to GitHub Pages."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise RuntimeError(f"public source must be a regular file: {source.relative_to(PUBLIC)}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def collect_public_sources() -> list[Path]:
    if not PUBLIC.is_dir() or PUBLIC.is_symlink():
        raise RuntimeError("public must be a regular directory")
    sources = []
    for path in sorted(PUBLIC.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"public source symlink is not allowed: {path.relative_to(PUBLIC)}")
        if path.is_file():
            sources.append(path)
    for required in ("index.html", "CNAME", "Sitemap.xml", "robots.txt", "style.css", "404.html"):
        if not (PUBLIC / required).is_file():
            raise RuntimeError(f"required public file missing: {required}")
    return sources


def build(output: Path, manifest_path: Path) -> dict[str, object]:
    output = Path(os.path.abspath(output.expanduser()))
    manifest_path = Path(os.path.abspath(manifest_path.expanduser()))
    if output.is_symlink():
        raise RuntimeError(f"artifact output must not be a symlink: {output}")
    resolved_output = output.resolve(strict=False)
    if resolved_output == ROOT or ROOT in resolved_output.parents:
        raise RuntimeError("artifact output must be outside the repository source tree")
    if output.exists():
        raise RuntimeError(f"artifact output already exists; refusing to delete it: {output}")
    if manifest_path.is_symlink():
        raise RuntimeError(f"manifest path must not be a symlink: {manifest_path}")
    resolved_manifest = manifest_path.resolve(strict=False)
    if resolved_manifest == resolved_output or resolved_output in resolved_manifest.parents:
        raise RuntimeError("manifest must be outside the artifact output")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{output.name}.stage-", dir=output.parent))
    try:
        for source in collect_public_sources():
            copy_file(source, stage / source.relative_to(PUBLIC))
        (stage / ".nojekyll").write_bytes(b"")
        files = {}
        for path in sorted(p for p in stage.rglob("*") if p.is_file()):
            relative = path.relative_to(stage).as_posix()
            files[relative] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
        manifest = {"schema": 1, "files": files}
        os.replace(stage, output)
        stage = None
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        temp_manifest = manifest_path.with_name(f".{manifest_path.name}.tmp")
        temp_manifest.write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        os.replace(temp_manifest, manifest_path)
        return manifest
    finally:
        if stage is not None and stage.exists():
            shutil.rmtree(stage)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()
    manifest = build(args.output, args.manifest)
    print(json.dumps({"ok": True, "files": len(manifest["files"])}, sort_keys=True))


if __name__ == "__main__":
    main()
