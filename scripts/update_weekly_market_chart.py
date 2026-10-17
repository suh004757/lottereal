#!/usr/bin/env python3
"""Refresh the home page weekly apartment price-change chart from 한국부동산원 R-ONE.

Fetches the weekly apartment sale price index (T244183132827305), computes the
week-over-week change for a fixed set of regions, and rewrites the chart block in
public/index.html between the weekly-apt-chart markers plus an evidence JSON.

Usage:
  python3 scripts/update_weekly_market_chart.py            # fetch + write
  python3 scripts/update_weekly_market_chart.py --dry-run  # fetch + print JSON
  python3 scripts/update_weekly_market_chart.py --input rows.json  # offline rows

The REB key is read server-side by reb_stats.load_env() and never printed.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import sys
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reb_stats  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "public" / "index.html"
EVIDENCE = ROOT / "public" / "Data" / "weekly-apt-change.json"
START = "<!-- weekly-apt-chart:start -->"
END = "<!-- weekly-apt-chart:end -->"
SOURCE_URL = "https://www.reb.or.kr/r-one/"

# (label, CLS_FULLNM) in display order; 송파구 is the office's core area.
REGIONS = (
    ("전국", "전국"),
    ("경기", "경기"),
    ("서울", "서울"),
    ("강남구", "서울>강남지역>동남권>강남구"),
    ("서초구", "서울>강남지역>동남권>서초구"),
    ("송파구", "서울>강남지역>동남권>송파구"),
)
FOCUS = "송파구"
GANGNAM3 = ("강남구", "서초구", "송파구")
CHART_MAX = Decimal("0.40")
MAX_PLAUSIBLE_WEEKLY_CHANGE = Decimal("3.00")
ORDINALS = ("첫째", "둘째", "셋째", "넷째", "다섯째")


class ChartDataError(RuntimeError):
    pass


def fetch_rows(weeks: int = 3, max_pages: int = 12) -> list[dict]:
    key = reb_stats.get_key(reb_stats.load_env())
    params = {"STATBL_ID": reb_stats.WEEKLY_APT_SALE_INDEX, "DTACYCLE_CD": "WK"}
    first = reb_stats.request("SttsApiTblData.do", {"pIndex": 1, "pSize": 1, **params}, key)
    head = first.get("SttsApiTblData", [{}])[0].get("head", [])
    total = int(head[0]["list_total_count"]) if head else 0
    if not total:
        raise ChartDataError("REB weekly index total count unavailable")
    wanted = {full for _, full in REGIONS}
    rows: list[dict] = []
    last_page = math.ceil(total / 100)
    for page in range(last_page, max(last_page - max_pages, 0), -1):
        payload = reb_stats.request("SttsApiTblData.do", {"pIndex": page, "pSize": 100, **params}, key)
        page_rows = reb_stats.rows_from(payload, "SttsApiTblData")
        rows.extend(row for row in page_rows if row.get("CLS_FULLNM") in wanted and row.get("ITM_ID") == 10001)
        if all(len({r["WRTTIME_DESC"] for r in rows if r["CLS_FULLNM"] == full}) >= weeks for full in wanted):
            break
    return rows


def pct_change(current: Decimal, previous: Decimal) -> Decimal:
    return ((current / previous - 1) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def build_series(rows: list[dict]) -> dict:
    """Return latest two weekly changes per region; all regions must share dates."""
    by_region: dict[str, dict[str, Decimal]] = {}
    for row in rows:
        by_region.setdefault(row["CLS_FULLNM"], {})[row["WRTTIME_DESC"]] = Decimal(str(row["DTA_VAL"]))
    dates = None
    for label, full in REGIONS:
        series = by_region.get(full)
        if not series or len(series) < 3:
            raise ChartDataError(f"not enough weekly points for {label}")
        latest = sorted(series)[-3:]
        if dates is None:
            dates = latest
        elif latest != dates:
            raise ChartDataError(f"week mismatch for {label}: {latest} != {dates}")
    regions = []
    for label, full in REGIONS:
        series = by_region[full]
        two_ago, previous, current = (series[d] for d in dates)
        change = pct_change(current, previous)
        prev_change = pct_change(previous, two_ago)
        for value in (change, prev_change):
            if abs(value) > MAX_PLAUSIBLE_WEEKLY_CHANGE:
                raise ChartDataError(f"implausible weekly change for {label}: {value}")
        regions.append({
            "label": label,
            "cls_fullnm": full,
            "index": float(current),
            "previous_index": float(previous),
            "change_pct": float(change),
            "previous_change_pct": float(prev_change),
        })
    return {"survey_date": dates[2], "previous_survey_date": dates[1], "regions": regions}


def signed(value: float) -> str:
    if value > 0:
        return f"+{value:.2f}%"
    if value < 0:
        return f"−{abs(value):.2f}%"
    return "0.00%"


def week_label(survey: date) -> str:
    return f"{survey.year}년 {survey.month}월 {ORDINALS[(survey.day - 1) // 7]} 주({survey.month}월 {survey.day}일 기준)"


def headline(data: dict) -> str:
    values = {r["label"]: r["change_pct"] for r in data["regions"]}
    seoul = values["서울"]
    gangnam = [values[name] for name in GANGNAM3]
    if seoul > 0 and all(v < 0 for v in gangnam):
        return "서울은 오르고, 강남 3구는 내렸습니다"
    if seoul > 0 and all(v > 0 for v in gangnam):
        return "서울과 강남 3구가 함께 올랐습니다"
    if seoul < 0 and all(v < 0 for v in gangnam):
        return "서울과 강남 3구가 함께 내렸습니다"
    if seoul < 0 and all(v > 0 for v in gangnam):
        return "서울은 내렸지만, 강남 3구는 올랐습니다"
    return f"서울 {signed(seoul)}, 송파 {signed(values[FOCUS])} — 이번 주 아파트값 흐름"


def trend_phrase(current: float, previous: float) -> str:
    if current == previous:
        return "지난주와 같은 변동률입니다"
    if current > 0 and previous > 0:
        return "상승 폭이 커졌습니다" if current > previous else "상승 폭이 줄었습니다"
    if current < 0 and previous < 0:
        return "하락 폭이 커졌습니다" if current < previous else "하락 폭이 줄었습니다"
    if current > 0:
        return "상승으로 전환했습니다"
    if current < 0:
        return "하락으로 전환했습니다"
    return "보합을 기록했습니다"


def lead(data: dict) -> str:
    values = {r["label"]: r for r in data["regions"]}
    seoul, focus = values["서울"], values[FOCUS]
    survey = date.fromisoformat(data["survey_date"])
    return (
        f"{week_label(survey)} 주간 아파트 매매가격 변동률입니다. "
        f"서울은 {signed(seoul['change_pct'])}, 송파구는 {signed(focus['change_pct'])}로 "
        f"지난주({signed(focus['previous_change_pct'])})보다 {trend_phrase(focus['change_pct'], focus['previous_change_pct'])}."
    )


def bar_width(value: float) -> str:
    width = min(Decimal(str(abs(value))) / CHART_MAX * 50, Decimal(50))
    return f"{width:.2f}%"


def marker_left(value: float) -> str:
    clamped = max(min(Decimal(str(value)), CHART_MAX), -CHART_MAX)
    return f"{(50 + clamped / CHART_MAX * 50):.2f}%"


def render_row(region: dict) -> str:
    value, prev = region["change_pct"], region["previous_change_pct"]
    classes = ["lr-weekly__row", "is-up" if value > 0 else "is-down" if value < 0 else "is-flat"]
    focus = region["label"] == FOCUS
    if focus:
        classes.append("is-focus")
    name = html.escape(region["label"]) + ("<em>핵심권역</em>" if focus else "")
    return (
        f'              <li class="{" ".join(classes)}" tabindex="0">\n'
        f'                <span class="lr-weekly__name">{name}</span>\n'
        f'                <span class="lr-weekly__track" aria-hidden="true"><span class="lr-weekly__bar" style="--w:{bar_width(value)}"></span>'
        f'<span class="lr-weekly__prev" style="left:{marker_left(prev)}"></span></span>\n'
        f'                <strong class="lr-weekly__value">{signed(value)}</strong>\n'
        f'                <span class="lr-weekly__tip" role="tooltip">지난주 {signed(prev)} → 이번 주 {signed(value)}</span>\n'
        f"              </li>"
    )


def render_block(data: dict) -> str:
    rows = "\n".join(render_row(region) for region in data["regions"])
    survey = html.escape(data["survey_date"])
    return f"""{START}
          <div class="lr-stats-card__intro">
            <p class="lr-kicker">이번 주 공식 지표 · 한국부동산원</p>
            <h2>{html.escape(headline(data))}</h2>
            <p class="lr-lead">{html.escape(lead(data))}</p>
            <ul class="lr-weekly__legend">
              <li><span class="lr-weekly__key is-up"></span>상승</li>
              <li><span class="lr-weekly__key is-down"></span>하락</li>
              <li><span class="lr-weekly__key is-prev"></span>지난주</li>
            </ul>
          </div>
          <figure class="lr-weekly__chart">
            <figcaption class="lr-weekly__caption">주간 아파트 매매가격 변동률 (%, {survey} 기준)</figcaption>
            <ol class="lr-weekly__rows">
{rows}
            </ol>
            <div class="lr-weekly__axis" aria-hidden="true"><span>−0.40</span><span>0</span><span>+0.40</span></div>
          </figure>
          <p class="lr-source-note">출처: <a href="{SOURCE_URL}" target="_blank" rel="noreferrer">한국부동산원 부동산통계정보(R-ONE)</a> 주간 아파트 매매가격지수, {survey} 기준. 변동률은 직전 주 지수 대비 계산값(소수 둘째 자리 반올림)입니다. 지역 평균 흐름을 보는 참고 지표이며 개별 단지·매물 가격과 다를 수 있고, 매수·매도 권유가 아닙니다.</p>
          {END}"""


def apply_to_home(text: str, block: str) -> str:
    start = text.find(START)
    end = text.find(END)
    if start < 0 or end < start:
        raise ChartDataError("weekly chart markers missing in index.html")
    return text[:start] + block + text[end + len(END):]


def evidence(data: dict) -> dict:
    return {
        "source": "한국부동산원 부동산통계정보 R-ONE OpenAPI",
        "source_url": SOURCE_URL,
        "statbl_id": reb_stats.WEEKLY_APT_SALE_INDEX,
        "metric": "주간 아파트 매매가격지수 → 전주 대비 변동률(%)",
        **data,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, help="JSON list of R-ONE rows instead of calling the API")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--home", type=Path, default=HOME)
    parser.add_argument("--evidence", type=Path, default=EVIDENCE)
    args = parser.parse_args(argv)

    rows = json.loads(args.input.read_text(encoding="utf-8")) if args.input else fetch_rows()
    data = build_series(rows)
    if args.dry_run:
        print(json.dumps(evidence(data), ensure_ascii=False, indent=2))
        return 0

    if args.evidence.exists():
        previous = json.loads(args.evidence.read_text(encoding="utf-8"))
        if previous.get("survey_date", "") > data["survey_date"]:
            raise ChartDataError(f"refusing to move chart backwards: {previous['survey_date']} -> {data['survey_date']}")

    home = args.home.read_text(encoding="utf-8")
    updated = apply_to_home(home, render_block(data))
    payload = json.dumps(evidence(data), ensure_ascii=False, indent=2) + "\n"
    changed = updated != home or not args.evidence.exists() or args.evidence.read_text(encoding="utf-8") != payload
    if changed:
        args.home.write_text(updated, encoding="utf-8")
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        args.evidence.write_text(payload, encoding="utf-8")
    print(json.dumps({"ok": True, "changed": changed, "survey_date": data["survey_date"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ChartDataError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
