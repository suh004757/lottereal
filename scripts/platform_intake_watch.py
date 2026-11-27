"""Offline M3i fixture intake. No mailbox, database client, CLI or scheduler.

The envelope models provider-verified, sender-aligned metadata; this module does
not authenticate email. Never map raw message headers to these fixture fields.
The caller supplies a fixture-only atomic insert-once sink (no update or readback).
"""

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import re


@dataclass(frozen=True, slots=True, repr=False)
class FixtureEnvelope:
    provider_id: str
    sender: str
    aligned_spf: bool
    aligned_dkim: bool


_KINDS = {'매물': 'listing_offer', '찾는 사람': 'seeker'}
_CHANNELS = {'카톡', '문자', '전화메모'}
_TYPES = {'매매', '전세', '월세', '단기임대'}
_AMOUNTS = {'가격': 'price_manwon', '보증금': 'deposit_manwon', '월세': 'monthly_rent_manwon'}
_FIELDS = {'종류', '경로', '거래', '지역', '입주', '이름', '전화', *_AMOUNTS}
_MAX_AMOUNT = 9_007_199_254_740_991  # Exact in the admin browser too.


def _structured_fields(body):
    """Parse explicit Korean labels only; one invalid field invalidates all."""
    fields = {}
    for line in body.splitlines():
        if not line.strip():
            continue
        label, _, value = line.partition(':')
        label, value = label.strip(), value.strip()
        if label not in _FIELDS or label in fields or not value:
            return {}
        fields[label] = value

    kind = _KINDS.get(fields.get('종류', ''))
    channel, transaction, district = (fields.get(label, '') for label in ('경로', '거래', '지역'))
    if (not kind or channel not in _CHANNELS or transaction not in _TYPES
            or not re.fullmatch(r'[가-힣A-Za-z][가-힣A-Za-z -]{0,29}', district)):
        return {}

    parsed = {'transaction_type': transaction, 'district': district}
    for label, key in _AMOUNTS.items():
        if label not in fields:
            continue
        value = fields[label]
        if not re.fullmatch(r'[0-9]{1,16}', value) or int(value) > _MAX_AMOUNT:
            return {}
        parsed[key] = int(value)
    if '입주' in fields:
        value = fields['입주']
        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
            return {}
        try:
            parsed['available_from'] = date.fromisoformat(value).isoformat()
        except ValueError:
            return {}

    name, phone = fields.get('이름'), fields.get('전화')
    if name is not None and not re.fullmatch(r'[가-힣A-Za-z][가-힣A-Za-z -]{0,29}', name):
        return {}
    if phone is not None and not re.fullmatch(r'(?:[0-9]{9,11}|[0-9]{2,3}-[0-9]{3,4}-[0-9]{4})', phone):
        return {}
    return {'kind': kind, 'intake_channel': channel, 'parsed': parsed,
            'contact_name': name, 'contact_phone': phone}


def intake_fixture(envelope, read_body, *, approved_senders, insert_once, enabled=False):
    """Return a redacted outcome. Call the sink at most once per invocation.

    The sink returns True for a new row, False for a duplicate and must never
    replace existing data. Storage failures are ambiguous and are not retried.
    """
    if enabled is not True:
        return 'disabled'
    if (type(envelope) is not FixtureEnvelope
            or envelope.aligned_spf is not True or envelope.aligned_dkim is not True
            or not isinstance(envelope.sender, str)
            or envelope.sender not in approved_senders
            or not isinstance(envelope.provider_id, str)
            or not re.fullmatch(r'fixture-[A-Za-z0-9_-]{1,64}', envelope.provider_id)):
        return 'rejected'

    try:
        body = read_body()
    except Exception:
        return 'unavailable'
    if not isinstance(body, str) or not 1 <= len(body) <= 8192 or not body.strip() or '\x00' in body:
        return 'rejected'
    try:
        body.encode('utf-8')
    except UnicodeError:
        return 'rejected'

    key = sha256(f'platform-intake-fixture-v1:{envelope.provider_id}'.encode('ascii')).hexdigest()
    row = {'source_message_key': key, 'raw_text': body, 'kind': 'other', 'parsed': None,
           'contact_name': None, 'contact_phone': None, 'intake_channel': None}
    row.update(_structured_fields(body))
    try:
        result = insert_once(row)
    except Exception:
        return 'unavailable'
    if result is True:
        return 'inserted'
    if result is False:
        return 'duplicate'
    return 'unavailable'
