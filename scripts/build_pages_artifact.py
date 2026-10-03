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
PUBLIC_DIRECTORIES = ("Data", "admin", "css", "fonts", "img", "js", "redirect", "reports")
PUBLIC_ROOT_FILES = ("CNAME", "Sitemap.xml", "robots.txt", "style.css", "style.css.map", "404.md")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise RuntimeError(f"public source must be a regular file: {source.relative_to(ROOT)}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def collect_public_sources() -> list[Path]:
    sources = sorted(ROOT.glob("*.html"), key=lambda path: path.name)
    for name in PUBLIC_ROOT_FILES:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"required public file missing or unsafe: {name}")
        sources.append(path)
    for directory_name in PUBLIC_DIRECTORIES:
        directory = ROOT / directory_name
        if not directory.is_dir() or directory.is_symlink():
            raise RuntimeError(f"required public directory missing or unsafe: {directory_name}")
        for path in sorted(directory.rglob("*")):
            if path.is_symlink():
                raise RuntimeError(f"public source symlink is not allowed: {path.relative_to(ROOT)}")
            if path.is_file():
                sources.append(path)
    downloads = ROOT / "downloads"
    if downloads.exists():
        if not downloads.is_dir() or downloads.is_symlink():
            raise RuntimeError("downloads must be a regular directory")
        for path in sorted(downloads.rglob("*")):
            if path.is_symlink():
                raise RuntimeError(f"public download symlink is not allowed: {path.relative_to(ROOT)}")
            if path.is_file():
                sources.append(path)
    return sorted(set(sources), key=lambda path: path.relative_to(ROOT).as_posix())


def build(output: Path, manifest_path: Path) -> dict[str, object]:
    output = output.resolve()
    manifest_path = manifest_path.resolve()
    if output == ROOT or ROOT in output.parents:
        raise RuntimeError("artifact output must be outside the repository source tree")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{output.name}.stage-", dir=output.parent))
    try:
        for source in collect_public_sources():
            copy_file(source, stage / source.relative_to(ROOT))
        (stage / ".nojekyll").write_bytes(b"")
        files = {}
        for path in sorted(p for p in stage.rglob("*") if p.is_file()):
            relative = path.relative_to(stage).as_posix()
            files[relative] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
        manifest = {"schema": 1, "files": files}
        if output.exists():
            if output.is_symlink() or not output.is_dir():
                raise RuntimeError(f"refusing to replace unsafe artifact output: {output}")
            shutil.rmtree(output)
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
