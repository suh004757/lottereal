#!/usr/bin/env python3
"""Render one pre-aggregated KST month from stdin to Markdown on stdout."""

import calendar
from decimal import Decimal, ROUND_HALF_UP
import json
import re
import sys


UNKNOWN = '미확인'
NA = '—'
MAX_INPUT_BYTES = 8192
MAX_COUNTER = 2**63 - 1
GRADES = (('site_visit', '임장 확인'), ('owner_listed', '소유자 직접 의뢰'),
          ('tenant_listed', '거주 임차인 의뢰'))
COMMON = {'calls', 'inquiries', 'qualified_inquiries', 'visit_appointments',
          'contracts', 'ad_spend_krw'}
ZIGBANG = COMMON | {'receipt_count', 'receipt_days_observed'}
PLATFORM = COMMON | {key for key, _ in GRADES} | {
    'phone_clicks', 'listing_requests', 'new_publications', 'stored_forms',
    'visible_listings', 'needs_recheck', 'close_lag_observed', 'close_lag_days',
}


def unique_keys(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise ValueError
        obj[key] = value
    return obj


def counters(obj, allowed):
    if not isinstance(obj, dict) or obj.keys() - allowed:
        raise ValueError
    if any(value is not None and (type(value) is not int or not 0 <= value <= MAX_COUNTER)
           for value in obj.values()):
        raise ValueError
    return obj


def validate(data):
    if not isinstance(data, dict) or data.keys() - {'month', 'comparable_results', 'zigbang', 'platform'}:
        raise ValueError
    month = data.get('month')
    if not isinstance(month, str) or not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', month):
        raise ValueError
    year, number = map(int, month.split('-'))
    if year == 0:
        raise ValueError
    days = calendar.monthrange(year, number)[1]
    comparable = data.get('comparable_results')
    if comparable is not None and type(comparable) is not bool:
        raise ValueError
    zigbang = counters(data.get('zigbang', {}), ZIGBANG)
    platform = counters(data.get('platform', {}), PLATFORM)
    coverage = zigbang.get('receipt_days_observed')
    if coverage is not None and coverage > days:
        raise ValueError
    stale, visible = platform.get('needs_recheck'), platform.get('visible_listings')
    if stale is not None and visible is not None and stale > visible:
        raise ValueError
    if platform.get('close_lag_observed') == 0 and platform.get('close_lag_days') not in (None, 0):
        raise ValueError
    return month, days, comparable, zigbang, platform


def display(value):
    return UNKNOWN if value is None else str(value)


def divide(numerator, denominator, style):
    if denominator is None:
        return UNKNOWN
    if denominator == 0:
        return NA
    if numerator is None:
        return UNKNOWN
    if style == 'percent':
        value = (Decimal(numerator * 100) / denominator).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
        return f'{value}% ({numerator}/{denominator})'
    value = (Decimal(numerator) / denominator).quantize(
        Decimal('0.1') if style == 'days' else Decimal('1'), rounding=ROUND_HALF_UP,
    )
    return f'{value}일 ({denominator}건)' if style == 'days' else str(value)


def render(month, days, comparable, zigbang, platform):
    z, p = zigbang.get, platform.get
    grades = [p(key) for key, _ in GRADES]
    graded = sum(grades) if all(value is not None for value in grades) else None
    coverage = z('receipt_days_observed')
    comparison = {True: '동일 월·유사 매물군 확인 (확인된 결과 항목만 비교)',
                  False: '채널 간 비교 불가', None: '채널 간 비교 미확인'}[comparable]
    lines = [f'# 잠실살이 월간 지표 {month} (KST)', '',
             '미확인 = 미수집·집계 공백·미검증. 0 = 확인된 0건/원. — = 해당 없음 또는 분모 0.', '']

    def table(title, rows):
        lines.extend([f'## {title}', '', '| 지표 | 직방 | 잠실살이 |', '| --- | ---: | ---: |'])
        lines.extend(f'| {label} | {left} | {right} |' for label, left, right in rows)
        lines.append('')

    table('행동 신호', [('전화 버튼 클릭', NA, display(p('phone_clicks')))])
    table('공급', [
        ('등록 요청', NA, display(p('listing_requests'))),
        ('월 신규 게시', NA, display(p('new_publications'))),
        *((label, NA, display(p(key))) for key, label in GRADES),
        ('임장 확인 비율', NA, divide(p('site_visit'), graded, 'percent')),
    ])
    table('문의', [
        ('직방 메일 알림 건수', display(z('receipt_count') if coverage == days else None), NA),
        ('실제 통화', display(z('calls')), display(p('calls'))),
        ('승인된 저장 폼', NA, display(p('stored_forms'))),
        ('확인된 중복 제거 문의', display(z('inquiries')), display(p('inquiries'))),
    ])
    coverage_text = UNKNOWN if coverage is None else f'{coverage}/{days}일'
    lines.extend([f'직방 메일 수집 확인: {coverage_text}. 메일 알림 및 전화 클릭은 문의 분모에서 제외.', ''])
    table('결과', [
        *((label, display(z(key)), display(p(key))) for key, label in (
            ('qualified_inquiries', '적합 문의'), ('visit_appointments', '방문 약속'),
            ('contracts', '계약'), ('ad_spend_krw', '광고비 (원)'),
        )),
        *((label, divide(z('ad_spend_krw'), z(key), 'krw'),
           divide(p('ad_spend_krw'), p(key), 'krw')) for key, label in (
            ('inquiries', '문의당 비용 (원)'), ('contracts', '계약당 비용 (원)'),
        )),
    ])
    lines.extend([comparison + '. 광고 축소는 비교 가능한 결과가 확인된 뒤 오너가 판단.', '',
                  '### 운영 품질 (성과 지표와 별도)', '',
                  '- 재확인 필요: ' + divide(p('needs_recheck'), p('visible_listings'), 'percent'),
                  '- 거래 완료 후 `closed_at` 평균 반영 지연: '
                  + divide(p('close_lag_days'), p('close_lag_observed'), 'days'), ''])
    return '\n'.join(lines)


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise ValueError
        data = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_keys)
        report = render(*validate(data))
    except (ValueError, RecursionError):
        print('Invalid aggregate metrics input.', file=sys.stderr)
        return 2
    sys.stdout.buffer.write(report.encode('utf-8'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
