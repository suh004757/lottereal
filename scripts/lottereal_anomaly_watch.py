#!/usr/bin/env python3
"""Silent anomaly watchdog for LotteReal.

Prints nothing when checks are OK. Cron with no_agent=True can deliver stdout
only when there is something unusual that needs james' attention.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MENTION = "<@286133857881948171>"
LIVE_URL = "https://lottes.co.kr/"


def run(cmd: list[str], timeout: int = 120) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=REPO, text=True, capture_output=True, timeout=timeout)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def public_copy_issues() -> list[str]:
    blocked = [
        "별도 상단 메뉴",
        "시장 리포트 안에 자연스럽게 노출",
        "운영 기준",
        "API" + " key",
        "API" + " 키",
        "MCP",
        "OpenAPI",
        "STATBL",
        "efYd",
        "중개보조원",
        "고지의무",
        "분쟁을 부추기는",
    ]
    public_paths = [REPO / "index.html", REPO / "listings.html"]
    content_dir = REPO / "content" / "daily"
    if content_dir.exists():
        public_paths.extend(content_dir.glob("*.json"))
    issues: list[str] = []
    for path in public_paths:
        text = path.read_text(encoding="utf-8", errors="ignore")
        if path.suffix == ".json":
            try:
                payload = json.loads(text)
                text = "\n".join(str(payload.get(key, "")) for key in ["title", "summary", "report_md"])
            except json.JSONDecodeError:
                issues.append(f"JSON 파싱 실패: {path.relative_to(REPO)}")
                continue
        for token in blocked:
            if token in text:
                issues.append(f"공개 문구 점검 필요: {path.relative_to(REPO)} contains {token}")
    return issues


def main() -> int:
    issues: list[str] = []

    try:
        with urllib.request.urlopen(LIVE_URL, timeout=20) as response:
            if response.status != 200:
                issues.append(f"라이브 사이트 상태 {response.status}")
    except Exception as exc:  # noqa: BLE001
        issues.append(f"라이브 사이트 접속 실패: {type(exc).__name__}")

    code, output = run(["python3", "scripts/maintenance_check.py"], timeout=180)
    if code != 0:
        issues.append("maintenance_check.py 실패")
        if output:
            issues.append(output[:800])
    else:
        try:
            data = json.loads(output)
            if not data.get("ok"):
                issues.append("maintenance_check ok=false")
            if data.get("link_errors"):
                issues.append(f"링크 오류 {len(data['link_errors'])}건")
            if data.get("js_errors"):
                issues.append(f"JS 오류 {len(data['js_errors'])}건")
            supabase = data.get("supabase", {})
            if not supabase.get("ok"):
                issues.append("Supabase 상태 점검 실패")
        except Exception:
            issues.append("maintenance_check 출력 파싱 실패")

    issues.extend(public_copy_issues())

    if issues:
        print(f"{MENTION} 롯데부동산 사이트 운영 특이사항 감지")
        for item in issues[:8]:
            print(f"- {item}")
        print("확인 위치: /opt/data/projects/lottereal")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
