# Public listing media: intended, with one real risk

Listing photos stay in the **public** bucket, including after a listing is closed. This is
intended (owner decision, 2026-10-18): past listings show prospects what kinds of properties
the office handles, which is useful for marketing.

The real risk is **a closed or past listing being read as currently available** (허위·미끼
매물 광고 우려). Controls in place:

- Public listing reads only return rows with `closed_at is null` (migration 028).
- `listing-detail.html` for a closed or unknown id says "거래가 완료되었거나 내려간 매물입니다".
- Listings past 30 days since `last_verified_at` show "거래 가능 여부 확인 필요".
- Home 직방 inquiry records: only the last-24h rows say "이 매물 문의"; older rows say
  "비슷한 매물 문의", with a note that the records are from inquiry time and may be closed.

If closed listings are ever shown on purpose (e.g. a 거래 완료 사례 gallery), each item must be
labeled 거래 완료 with its date and must not offer a "this listing" inquiry action.
