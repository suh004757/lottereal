#!/usr/bin/env python3
"""Read-only, metadata-only scanner for private ADMIN chat drafts."""

from __future__ import annotations

import argparse
import json
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

from lottereal_supabase import load_env, supabase_request

DEFAULT_PAGE_SIZE = 200


def intake_metadata(item: dict) -> dict:
    value = item.get('metadata')
    return value if isinstance(value, dict) else {}


def is_admin_chat_intake(item: dict) -> bool:
    metadata = intake_metadata(item)
    return item.get('status') == 'draft' and metadata.get('intake_source') == 'admin-chat'


def normalize_draft_id(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        return None


def fetch_admin_intakes(page_size: int = DEFAULT_PAGE_SIZE) -> list[dict]:
    env = load_env()
    page_size = max(1, min(int(page_size), 1000))
    offset = 0
    collected: list[dict] = []
    while True:
        query = urlencode({
            'select': 'id,status,metadata',
            'status': 'eq.draft',
            'order': 'created_at.asc,id.asc',
            'limit': str(page_size),
            'offset': str(offset),
        })
        _, page = supabase_request('GET', 'market_reports', env, query='?' + query)
        page = page or []
        if not isinstance(page, list):
            raise RuntimeError('Unexpected ADMIN intake response')
        collected.extend(item for item in page if isinstance(item, dict) and is_admin_chat_intake(item))
        if len(page) < page_size:
            break
        offset += page_size
    return collected


def safe_image_count(value: object) -> int:
    try:
        count = int(str(value)) if value is not None else 0
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(count, 30))


def scan_item(item: dict) -> dict[str, Any]:
    metadata = intake_metadata(item)
    intake_type = metadata.get('intake_type')
    photo_state = metadata.get('photo_upload_state')
    return {
        'id': normalize_draft_id(item.get('id')),
        'intake_type': intake_type if intake_type in {'listing', 'article'} else 'unknown',
        'image_count': safe_image_count(metadata.get('image_count')),
        'photo_upload_state': photo_state if photo_state == 'complete' else 'unknown',
    }


def build_scan_payload(items: list[dict]) -> dict[str, Any]:
    drafts = [
        scan_item(item) for item in items
        if is_admin_chat_intake(item) and normalize_draft_id(item.get('id'))
    ]
    return {'draft_count': len(drafts), 'drafts': drafts}


def main() -> int:
    parser = argparse.ArgumentParser(description='Scan private ADMIN chat drafts')
    parser.add_argument('--page-size', type=int, default=DEFAULT_PAGE_SIZE)
    args = parser.parse_args()
    payload = build_scan_payload(fetch_admin_intakes(args.page_size))
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
