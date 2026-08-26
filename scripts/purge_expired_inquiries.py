#!/usr/bin/env python3
"""Silently purge inquiry records older than one calendar year."""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import quote

from lottereal_supabase import load_env, supabase_request


def one_year_ago(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    try:
        return current.replace(year=current.year - 1)
    except ValueError:
        return current.replace(year=current.year - 1, day=28)


def purge_expired_inquiries() -> int:
    cutoff = quote(one_year_ago().isoformat(), safe=':-T')
    _, rows = supabase_request(
        'DELETE', 'inquiries', load_env(), query=f'?created_at=lt.{cutoff}&select=id'
    )
    return len(rows or [])


if __name__ == '__main__':
    purge_expired_inquiries()
