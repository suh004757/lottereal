#!/usr/bin/env python3
"""Create visitor-safe LotteReal listing drafts from pasted Zigbang/Dabang/Kakao text.

Default behavior writes a local draft JSON under /opt/data/cache/lottereal/listing_drafts/.
It does not publish to the public site. Staff should review availability, legal ad fields,
photos, and owner consent before publishing.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

OUT_DIR = Path("/opt/data/cache/lottereal/listing_drafts")
DEFAULT_PHONE = "0507-1402-5055"

PROPERTY_TYPES = ["아파트", "오피스텔", "상가", "사무실", "빌라", "주택", "원룸", "투룸", "쓰리룸"]
TRADE_TYPES = ["매매", "전세", "월세", "임대"]
KNOWN_AREAS = ["송파", "잠실", "삼전", "석촌", "석촌동", "삼전동", "잠실동", "송파구", "강남", "강남구"]


def read_input(path: Path | None) -> str:
    if path:
        return path.read_text(encoding="utf-8")
    return sys.stdin.read()


def find_first(pattern: str, text: str) -> str:
    match = re.search(pattern, text, flags=re.I)
    return match.group(1).strip() if match else ""


def parse_price(text: str) -> tuple[str, int | None, dict]:
    normalized = text.replace(",", "")
    metadata: dict = {}
    # 월세 1000/80, 보증금 1000 월세 80
    monthly = re.search(r"(?:월세\s*)?(\d{2,6})\s*/\s*(\d{1,5})", normalized)
    if monthly:
        metadata["deposit"] = int(monthly.group(1))
        metadata["monthly_rent"] = int(monthly.group(2))
        return "월세", int(monthly.group(2)), metadata
    deposit = re.search(r"보증금\s*(\d{2,7})", normalized)
    rent = re.search(r"월세\s*(\d{1,5})", normalized)
    if deposit and rent:
        metadata["deposit"] = int(deposit.group(1))
        metadata["monthly_rent"] = int(rent.group(1))
        return "월세", int(rent.group(1)), metadata
    for trade in ["전세", "매매"]:
        m = re.search(rf"{trade}\s*(\d{{3,8}})", normalized)
        if m:
            return trade, int(m.group(1)), metadata
    # 억 단위 rough parse: 6.5억 -> 65000만원
    eok = re.search(r"(\d+(?:\.\d+)?)\s*억", normalized)
    if eok:
        return "매매" if "매매" in text else "전세" if "전세" in text else "", int(float(eok.group(1)) * 10000), metadata
    return "", None, metadata


def infer_area(text: str) -> tuple[str, str, str]:
    district = "송파구" if any(area in text for area in ["송파", "잠실", "삼전", "석촌"]) else ""
    area = next((area for area in KNOWN_AREAS if area in text), "")
    address = area if area and area not in {"송파", "강남"} else ""
    city = "서울" if area or "서울" in text else ""
    return city, district, address


def infer_property_type(text: str) -> str:
    if "쓰리룸" in text or "3룸" in text:
        return "빌라/다세대"
    if "투룸" in text or "2룸" in text:
        return "빌라/다세대"
    return next((t for t in PROPERTY_TYPES if t in text), "")


def clean_public_description(text: str) -> str:
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Remove direct platform sales prompts and excessive emoji, keep useful property info.
        line = re.sub(r"[📍👉📞☎️🔥✨⭐✅]+", "", line).strip()
        if re.search(r"동호수|호실|비밀번호|주민|집주인|계좌", line):
            continue
        lines.append(line)
    desc = "\n".join(lines)
    desc = re.sub(r"\n{3,}", "\n\n", desc).strip()
    if len(desc) > 900:
        desc = desc[:897].rstrip() + "…"
    return desc


def build_title(text: str, trade_type: str, property_type: str, address: str) -> str:
    area = address or next((a for a in KNOWN_AREAS if a in text), "송파 생활권")
    type_part = property_type or "매물"
    trade_part = trade_type or "상담"
    return f"{area} {type_part} {trade_part}"


def build_draft(text: str, source: str) -> dict:
    trade_type, price, metadata = parse_price(text)
    city, district, address = infer_area(text)
    property_type = infer_property_type(text)
    now = datetime.now(timezone.utc).isoformat()
    title = build_title(text, trade_type, property_type, address)
    public_desc = clean_public_description(text)
    metadata.update({
        "source_channel": source,
        "drafted_at": now,
        "review_required": True,
        "availability_required": True,
        "legal_ad_review_note": "공개 전 실제 거래 가능 여부, 중개대상물 표시·광고 필수항목, 사진 사용권, 거래완료/노출종료 여부 확인 필요. 7일/21일은 내부 재확인 주기일 뿐 법정 노출기간이 아님.",
        "recommended_review_days": 7,
        "stale_review_days": 21,
    })
    return {
        "title": title,
        "description": public_desc,
        "price": price,
        "currency": "KRW",
        "address": address,
        "city": city,
        "district": district,
        "property_type": trade_type or property_type or "매물",
        "images": [],
        "contact_name": "롯데부동산",
        "contact_phone": DEFAULT_PHONE,
        "contact_email": "",
        "metadata": metadata,
        "_publish_policy": {
            "publish_default": "draft_only",
            "public_site_rule": "검수된 대표 매물만 공개하고, 거래완료·확인불가 매물은 즉시 비공개/삭제 검토",
            "legal_note": "정확한 법률 판단은 별도 확인 필요. 일반 운영상 거래 불가 매물을 유입용으로 방치하지 않는 것이 안전함.",
        },
    }


def write_draft(draft: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_title = re.sub(r"[^0-9A-Za-z가-힣_-]+", "-", draft["title"]).strip("-")[:40] or "listing"
    path = OUT_DIR / f"{stamp}-{safe_title}.json"
    path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a local listing draft from pasted platform/Kakao text")
    parser.add_argument("input", nargs="?", type=Path, help="Text file; stdin when omitted")
    parser.add_argument("--source", default="staff-paste", help="Source label such as zigbang, dabang, kakao")
    parser.add_argument("--print", action="store_true", help="Print draft JSON to stdout")
    args = parser.parse_args()
    text = read_input(args.input).strip()
    if not text:
        raise SystemExit("No listing text provided")
    draft = build_draft(text, args.source)
    path = write_draft(draft)
    if args.print:
        print(json.dumps({"ok": True, "draft_path": str(path), "draft": draft}, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"ok": True, "draft_path": str(path), "title": draft["title"], "review_required": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
