#!/usr/bin/env python3
"""Listing-request retention only; no database access unless --apply is explicit.

After approval, use --apply --service NAME with an operator-managed libpq
service for the intended database and an authorized database login (not an API
key). Run one batch at a time; no scheduler or credential loading is included.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys

BATCH_SIZE = 100
BATCH_SQL = f"""\
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
with candidates as materialized (
  select id from public.pf_listing_requests
  where status in ('rejected', 'published')
    and terminal_at <= statement_timestamp() - interval '4320 hours'
    and (owner_name is not null or owner_phone is not null or description is not null)
  order by terminal_at, id
  limit {BATCH_SIZE}
  for update skip locked
), redacted as (
  update public.pf_listing_requests as r
  set owner_name = null, owner_phone = null, description = null
  from candidates as c where r.id = c.id
  returning 1
)
select count(*) from redacted;
commit;
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--apply', action='store_true', help='redact one approved batch')
    parser.add_argument('--service', help='explicit libpq service name, not a connection string')
    args = parser.parse_args()
    if not args.apply and args.service is None:
        print(0)
        return 0
    if not args.apply or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', args.service or ''):
        parser.error('--apply and a valid --service name are required together')

    count = ''
    try:
        result = subprocess.run(
            ['psql', '-XqAtw', '--set=ON_ERROR_STOP=1', f'--dbname=service={args.service}', '--file=-'],
            input=BATCH_SQL, capture_output=True, encoding='utf-8', timeout=30,
        )
        if result.returncode == 0:
            count = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired, UnicodeError):
        # Connection diagnostics can contain database details; keep them out of logs.
        count = ''
    if re.fullmatch(r'(?:0|[1-9][0-9]{0,2})', count) and int(count) <= BATCH_SIZE:
        print(count)
        return 0
    print('Listing request retention failed.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
