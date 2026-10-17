#!/usr/bin/env python3
"""Render category share cards (1200x630) from card-template.tpl with headless Chrome.

Output: public/img/og/report-<type>.png. Run manually when the card design changes.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = Path(__file__).with_name("card-template.tpl")
OUT = ROOT / "public" / "img" / "og"
TYPES = ("market", "checklist", "guide", "dispute")


def find_chrome() -> str:
    for candidate in (os.environ.get("CHROME_BIN"), shutil.which("google-chrome"), shutil.which("chromium"),
                      r"C:\Program Files\Google\Chrome\Application\chrome.exe"):
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("Chrome not found; set CHROME_BIN")


def main() -> int:
    chrome = find_chrome()
    OUT.mkdir(parents=True, exist_ok=True)
    template = TEMPLATE.read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        for kind in TYPES:
            page = Path(tmp) / f"{kind}.html"
            page.write_text(template.replace("<body>", f'<body data-show="{kind}">', 1), encoding="utf-8")
            target = OUT / f"report-{kind}.png"
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,630",
                            "--virtual-time-budget=5000", f"--screenshot={target}", page.as_uri()],
                           check=True, capture_output=True)
            print(target.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
