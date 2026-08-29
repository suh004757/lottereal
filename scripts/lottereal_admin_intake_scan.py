#!/usr/bin/env python3
"""Read-only scanner for private LotteReal ADMIN chat drafts.

This helper is invoked by the assistant from the owner's private Discord DM
when asked to review backend drafts. It never sends to Discord itself. Because
its output is only fetched on demand for owner review, it returns the full
private draft while excluding any system credentials (which are not stored in
the report row).
"""

from __future__ import annotations

import argparse
import json
from typing import Any
from urllib.parse import urlencode

from lottereal_supabase import load_env, supabase_request

DEFAULT_PAGE_SIZE = 200


def intake_metadata(item: dict) -> dict:
    value = item.get('metadata')
    return value if isinstance(value, dict) else {}


def is_admin_chat_intake(item: dict) -> bool:
    metadata = intake_metadata(item)
    return item.get('status') == 'draft' and metadata.get('intake_source') == 'admin-chat'


def fetch_admin_intakes(page_size: int = DEFAULT_PAGE_SIZE) -> list[dict]:
    env = load_env()
    page_size = max(1, min(int(page_size), 1000))
    offset = 0
    collected: list[dict] = []
    while True:
        query = urlencode({
            'select': 'id,slug,title,summary,report_md,evidence_json,status,metadata,created_at,updated_at',
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


def full_scan_item(item: dict) -> dict[str, Any]:
    fields = (
        'id', 'slug', 'title', 'summary', 'report_md', 'evidence_json',
        'status', 'metadata', 'created_at', 'updated_at'
    )
    return {field: item.get(field) for field in fields}


def build_scan_payload(items: list[dict]) -> dict[str, Any]:
    drafts = [full_scan_item(item) for item in items if is_admin_chat_intake(item)]
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
