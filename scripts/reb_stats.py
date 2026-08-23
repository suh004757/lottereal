#!/usr/bin/env python3
"""Small, secret-safe 한국부동산원 부동산통계정보 OpenAPI helper.

Reads `LOTTEREAL_REB_OPENAPI_KEY` or `REALESTATE_STATS_OPENAPI_KEY` from
/opt/data/.env by default. Never prints the key.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ENV_PATH = Path(os.environ.get("LOTTEREAL_ENV", "/opt/data/.env"))
BASE = "https://www.reb.or.kr/r-one/openapi"
WEEKLY_APT_SALE_INDEX = "T244183132827305"


def load_env(path: Path = ENV_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k in {"LOTTEREAL_REB_OPENAPI_KEY", "REALESTATE_STATS_OPENAPI_KEY"}})
    return values


def get_key(env: dict[str, str]) -> str:
    key = env.get("LOTTEREAL_REB_OPENAPI_KEY") or env.get("REALESTATE_STATS_OPENAPI_KEY")
    if not key:
        raise RuntimeError("LOTTEREAL_REB_OPENAPI_KEY or REALESTATE_STATS_OPENAPI_KEY is required")
    return key


def request(endpoint: str, params: dict[str, object], key: str) -> dict:
    payload = {
        "KEY": key,
        "Type": "json",
        **params,
    }
    url = f"{BASE}/{endpoint}?{urlencode(payload)}"
    req = Request(url, headers={"User-Agent": "Hermes-LotteReal-REB-Stats"})
    with urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def rows_from(payload: dict, root: str) -> list[dict]:
    if root not in payload:
        return []
    return payload[root][1].get("row", [])


def list_stats(key: str, keyword: str = "", limit: int = 30) -> list[dict]:
    out: list[dict] = []
    page = 1
    while len(out) < limit and page <= 20:
        payload = request("SttsApiTbl.do", {"pIndex": page, "pSize": 100}, key)
        rows = rows_from(payload, "SttsApiTbl")
        if not rows:
            break
        for row in rows:
            name = row.get("STATBL_NM", "")
            if not keyword or keyword in name:
                out.append({
                    "statbl_id": row.get("STATBL_ID"),
                    "name": name,
                    "cycle": row.get("DTACYCLE_NM"),
                    "data_start": row.get("DATA_START_YY"),
                    "data_end": row.get("DATA_END_YY"),
                })
                if len(out) >= limit:
                    break
        page += 1
    return out


def latest_weekly_apt_sale_index(key: str, cls_ids: dict[int, str]) -> dict[str, dict]:
    first = request("SttsApiTblData.do", {
        "pIndex": 1,
        "pSize": 1,
        "STATBL_ID": WEEKLY_APT_SALE_INDEX,
        "DTACYCLE_CD": "WK",
    }, key)
    head = first.get("SttsApiTblData", [{}])[0].get("head", [])
    total = head[0].get("list_total_count") if head else None
    if not total:
        raise RuntimeError("REB weekly index total count unavailable")

    found: dict[int, dict] = {}
    last_page = math.ceil(int(total) / 100)
    for page in range(last_page, max(last_page - 20, 0), -1):
        payload = request("SttsApiTblData.do", {
            "pIndex": page,
            "pSize": 100,
            "STATBL_ID": WEEKLY_APT_SALE_INDEX,
            "DTACYCLE_CD": "WK",
        }, key)
        for row in rows_from(payload, "SttsApiTblData"):
            cls_id = row.get("CLS_ID")
            if cls_id in cls_ids and row.get("ITM_ID") == 10001 and cls_id not in found:
                found[cls_id] = row
        if len(found) == len(cls_ids):
            break

    return {
        label: {
            "date": row.get("WRTTIME_DESC"),
            "value": row.get("DTA_VAL"),
            "region": row.get("CLS_FULLNM"),
            "statbl_id": WEEKLY_APT_SALE_INDEX,
            "metric": "주간 아파트 매매가격지수",
        }
        for cls_id, label in cls_ids.items()
        if (row := found.get(cls_id))
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="한국부동산원 부동산통계정보 OpenAPI helper")
    sub = parser.add_subparsers(dest="cmd", required=True)
    list_cmd = sub.add_parser("list-stats", help="Search available statistic tables")
    list_cmd.add_argument("--keyword", default="아파트")
    list_cmd.add_argument("--limit", type=int, default=20)
    sub.add_parser("latest-weekly-apt-sale", help="Latest weekly apartment sale index for Seoul/Gangnam/Songpa")
    args = parser.parse_args()

    key = get_key(load_env())
    if args.cmd == "list-stats":
        print(json.dumps(list_stats(key, args.keyword, args.limit), ensure_ascii=False, indent=2))
        return 0
    if args.cmd == "latest-weekly-apt-sale":
        data = latest_weekly_apt_sale_index(key, {50008: "서울", 50068: "강남구", 50069: "송파구"})
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
