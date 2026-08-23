#!/usr/bin/env python3
"""Read-only Google Analytics/Search Console helper for LotteReal.

Credentials stay outside the repo. This script prints aggregate analytics only;
it never prints service-account private keys or tokens.

Recommended invocation when dependencies are not installed globally:
  uv run --with google-auth --with requests python3 scripts/lottereal_google_analytics.py ga-summary
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, cast
from urllib.parse import quote

try:
    import requests
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
except Exception as exc:  # pragma: no cover - dependency guidance path
    print(json.dumps({
        "ok": False,
        "error": "missing_dependency",
        "message": "Run with: uv run --with google-auth --with requests python3 scripts/lottereal_google_analytics.py <command>",
        "detail": type(exc).__name__,
    }, ensure_ascii=False))
    sys.exit(2)

DEFAULT_ENV_PATHS = [Path('/opt/data/.env'), Path('.env')]
SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
]


def load_env_files() -> None:
    for path in DEFAULT_ENV_PATHS:
        if not path.exists():
            continue
        for raw in path.read_text(encoding='utf-8', errors='ignore').splitlines():
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def credentials() -> service_account.Credentials:
    load_env_files()
    cred_path = os.environ.get('LOTTEREAL_GOOGLE_APPLICATION_CREDENTIALS') or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if not cred_path:
        raise SystemExit(json.dumps({"ok": False, "error": "missing_credentials_path"}, ensure_ascii=False))
    path = Path(cred_path)
    if not path.exists():
        raise SystemExit(json.dumps({"ok": False, "error": "credentials_file_not_found", "path": str(path)}, ensure_ascii=False))
    creds = service_account.Credentials.from_service_account_file(str(path), scopes=SCOPES)
    creds.refresh(Request())
    return creds


def authed_headers() -> dict[str, str]:
    creds = credentials()
    return {'Authorization': f'Bearer {creds.token}', 'Content-Type': 'application/json'}


def ga_property_id() -> str:
    load_env_files()
    prop = os.environ.get('LOTTEREAL_GA4_PROPERTY_ID') or os.environ.get('GA4_PROPERTY_ID')
    if not prop:
        raise SystemExit(json.dumps({"ok": False, "error": "missing_ga4_property_id"}, ensure_ascii=False))
    return prop


def response_json(resp: requests.Response) -> dict[str, Any]:
    if not resp.headers.get('content-type', '').startswith('application/json'):
        return {'raw': resp.text[:500]}
    parsed = resp.json()
    return parsed if isinstance(parsed, dict) else {'raw': parsed}


def error_message(data: dict[str, Any]) -> Any:
    error = data.get('error')
    if isinstance(error, dict):
        return error.get('message') or error
    return data


def ga_run_report(body: dict[str, Any]) -> dict[str, Any]:
    prop = ga_property_id()
    url = f'https://analyticsdata.googleapis.com/v1beta/properties/{prop}:runReport'
    resp = requests.post(url, headers=authed_headers(), json=body, timeout=40)
    data = response_json(resp)
    if not resp.ok:
        return {'ok': False, 'status': resp.status_code, 'error': error_message(data)}
    return {'ok': True, 'status': resp.status_code, 'data': data}


def metric_value(row: dict[str, Any], index: int = 0) -> str:
    return row.get('metricValues', [{}])[index].get('value', '0')


def dim_value(row: dict[str, Any], index: int = 0) -> str:
    return row.get('dimensionValues', [{}])[index].get('value', '')


def ga_summary(args: argparse.Namespace) -> dict[str, Any]:
    common_range = {'startDate': args.start_date, 'endDate': args.end_date}
    totals = ga_run_report({
        'dateRanges': [common_range],
        'metrics': [{'name': name} for name in ['activeUsers', 'sessions', 'screenPageViews', 'eventCount']],
    })
    if not totals.get('ok'):
        return totals
    by_page = ga_run_report({
        'dateRanges': [common_range],
        'dimensions': [{'name': 'pagePath'}],
        'metrics': [{'name': 'screenPageViews'}, {'name': 'activeUsers'}],
        'orderBys': [{'metric': {'metricName': 'screenPageViews'}, 'desc': True}],
        'limit': args.limit,
    })
    by_event = ga_run_report({
        'dateRanges': [common_range],
        'dimensions': [{'name': 'eventName'}],
        'metrics': [{'name': 'eventCount'}],
        'orderBys': [{'metric': {'metricName': 'eventCount'}, 'desc': True}],
        'limit': args.limit,
    })
    total_row = (totals.get('data', {}).get('rows') or [{}])[0]
    return {
        'ok': True,
        'range': common_range,
        'property_id': ga_property_id(),
        'totals': {
            'activeUsers': metric_value(total_row, 0),
            'sessions': metric_value(total_row, 1),
            'screenPageViews': metric_value(total_row, 2),
            'eventCount': metric_value(total_row, 3),
        },
        'top_pages': [
            {'pagePath': dim_value(row), 'views': metric_value(row, 0), 'activeUsers': metric_value(row, 1)}
            for row in by_page.get('data', {}).get('rows', [])
        ] if by_page.get('ok') else {'error': by_page.get('error'), 'status': by_page.get('status')},
        'top_events': [
            {'eventName': dim_value(row), 'eventCount': metric_value(row, 0)}
            for row in by_event.get('data', {}).get('rows', [])
        ] if by_event.get('ok') else {'error': by_event.get('error'), 'status': by_event.get('status')},
    }


def gsc_sites(_: argparse.Namespace) -> dict[str, Any]:
    resp = requests.get('https://www.googleapis.com/webmasters/v3/sites', headers=authed_headers(), timeout=40)
    data = response_json(resp)
    if not resp.ok:
        return {'ok': False, 'status': resp.status_code, 'error': error_message(data)}
    return {'ok': True, 'sites': data.get('siteEntry', [])}


def gsc_query(args: argparse.Namespace) -> dict[str, Any]:
    site_url = args.site_url or os.environ.get('LOTTEREAL_GSC_SITE_URL')
    if not site_url:
        return {'ok': False, 'error': 'missing_site_url', 'message': 'Pass --site-url or set LOTTEREAL_GSC_SITE_URL'}
    body = {
        'startDate': args.start_date,
        'endDate': args.end_date,
        'dimensions': args.dimensions.split(','),
        'rowLimit': args.limit,
        'startRow': 0,
    }
    url = 'https://www.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query'.format(quote(site_url, safe=''))
    resp = requests.post(url, headers=authed_headers(), json=body, timeout=40)
    data = response_json(resp)
    if not resp.ok:
        return {'ok': False, 'status': resp.status_code, 'error': error_message(data)}
    return {'ok': True, 'siteUrl': site_url, 'rows': data.get('rows', [])}


def main() -> int:
    parser = argparse.ArgumentParser(description='Read-only LotteReal Google Analytics/Search Console helper')
    sub = parser.add_subparsers(dest='command', required=True)

    ga = sub.add_parser('ga-summary', help='GA4 aggregate totals, top pages, and top events')
    ga.add_argument('--start-date', default='28daysAgo')
    ga.add_argument('--end-date', default='today')
    ga.add_argument('--limit', type=int, default=10)
    ga.set_defaults(func=ga_summary)

    sites = sub.add_parser('gsc-sites', help='List Search Console sites visible to the service account')
    sites.set_defaults(func=gsc_sites)

    gsc = sub.add_parser('gsc-query', help='Query Search Console search analytics')
    gsc.add_argument('--site-url')
    gsc.add_argument('--start-date', default='28daysAgo')
    gsc.add_argument('--end-date', default='today')
    gsc.add_argument('--dimensions', default='query,page')
    gsc.add_argument('--limit', type=int, default=25)
    gsc.set_defaults(func=gsc_query)

    args = parser.parse_args()
    result = args.func(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
