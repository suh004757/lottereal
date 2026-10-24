#!/usr/bin/env python3
"""Songpa villa (연립·다세대) rent and trade pages per neighbourhood, from MOLIT's RTMS open API.

  fetch   pull the last 13 months of Songpa villa rents/trades into data/songpa-villa-prices.v1.json
  render  write public/villas/<slug>.html and their sitemap entries from that file
  refresh fetch + render; prints one JSON line with "changed"

Pages aggregate by area band and building age only. Building names, lot numbers, previous
rents and buyer/seller types are dropped, and no median is shown for fewer than MIN_COUNT
contracts, so a single household's contract cannot be singled out. The trade API is optional:
while MOLIT answers 403 for it, the last stored trades (if any) are kept and the page renders
without the sale section.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import songpa_apt_prices as apt  # noqa: E402
from songpa_apt_prices import SITE, _text, e, format_date, format_price  # noqa: E402

REPO = apt.REPO
CONFIG = REPO / "data" / "songpa-villa-areas.v1.json"
DATA = REPO / "data" / "songpa-villa-prices.v1.json"
PAGES = apt.PUBLIC / "villas"
SITEMAP = apt.SITEMAP
RENT_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent"
TRADE_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade"
HUB_NAME = "songpa-villa-prices.html"
HUB = apt.PUBLIC / HUB_NAME
SITEMAP_PATTERN = re.escape(f"{SITE}/{HUB_NAME}") + "|" + re.escape(SITE) + r"/villas/[^<]+\.html"
OFFICE_UMD = "삼전동"
OFFICE_NEIGHBOURS = {"석촌동", "송파동", "잠실동"}
MIN_COUNT = 3
AREA_BANDS = [(0, 30, "30㎡ 미만", "주로 원룸·1.5룸"), (30, 50, "30~50㎡", "주로 투룸"),
              (50, 70, "50~70㎡", "주로 쓰리룸"), (70, 10 ** 6, "70㎡ 이상", "큰 평형")]
AGE_BANDS = [(0, 10, "10년 이내"), (11, 20, "11~20년"), (21, 10 ** 6, "21년 이상")]


# ---------------------------------------------------------------- fetch

def _base(item) -> dict:
    return {
        "umd": _text(item, "umdNm"),
        "date": f"{int(_text(item, 'dealYear')):04d}-{int(_text(item, 'dealMonth')):02d}-{int(_text(item, 'dealDay')):02d}",
        "area": round(float(_text(item, "excluUseAr")), 2),
        "floor": int(_text(item, "floor") or 0),
        "build_year": int(_text(item, "buildYear") or 0),
    }


def _items(body: bytes):
    root = apt.ET.fromstring(body)
    code = (root.findtext(".//resultCode") or "").strip()
    if code not in ("000", "00"):
        raise RuntimeError(f"RTMS error {code}: {(root.findtext('.//resultMsg') or '').strip()}")
    return root, list(root.iter("item"))


def parse_rent_xml(body: bytes) -> tuple[list[dict], int]:
    root, items = _items(body)
    rents = [{**_base(item), "deposit": apt._manwon(item, "deposit"), "monthly": apt._manwon(item, "monthlyRent"),
              "kind": _text(item, "contractType") if _text(item, "contractType") in ("신규", "갱신") else ""}
             for item in items]
    return rents, int(root.findtext(".//totalCount") or 0)


def parse_trade_xml(body: bytes) -> tuple[list[dict], int]:
    root, items = _items(body)
    trades = [{**_base(item), "amount": apt._manwon(item, "dealAmount"), "direct": _text(item, "dealingGbn") == "직거래",
               "cancelled": bool(_text(item, "cdealType"))} for item in items]
    return trades, int(root.findtext(".//totalCount") or 0)


def collect(rents: list[dict], trades: list[dict] | None, config: dict, previous: dict) -> dict:
    by_umd = {a["umd"]: a["slug"] for a in config["areas"]}
    areas: dict[str, dict] = {slug: {"rents": [], "trades": []} for slug in by_umd.values()}
    for r in rents:
        slug = by_umd.get(r["umd"])
        if slug:
            areas[slug]["rents"].append([r["date"], r["area"], r["floor"], r["deposit"], r["monthly"], r["kind"], r["build_year"]])
    for slug in areas:
        if trades is None:
            areas[slug]["trades"] = previous.get(slug, {}).get("trades", [])
    for t in trades or []:
        slug = by_umd.get(t["umd"])
        if slug and not t["cancelled"]:
            areas[slug]["trades"].append([t["date"], t["area"], t["floor"], t["amount"], t["build_year"], "직거래" if t["direct"] else "중개"])
    for slot in areas.values():
        slot["rents"].sort(key=lambda row: (row[0], row[3], row[4]), reverse=True)
        slot["trades"].sort(key=lambda row: (row[0], row[3]), reverse=True)
    return areas


def fetch(env_path: Path, today: date) -> dict:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    previous = json.loads(DATA.read_text(encoding="utf-8")).get("areas", {}) if DATA.exists() else {}
    key = apt.load_key(env_path)
    months = apt.month_window(today)
    rents: list[dict] = []
    trades: list[dict] | None = []
    for ym in months:
        rents.extend(apt.fetch_month(key, config["lawd_cd"], ym, RENT_ENDPOINT, parse_rent_xml))
        if trades is not None:
            try:
                trades.extend(apt.fetch_month(key, config["lawd_cd"], ym, TRADE_ENDPOINT, parse_trade_xml))
            except RuntimeError as error:
                if "403" not in str(error):
                    raise
                trades = None  # trade API not activated for this key yet
    return {"source": "국토교통부 연립다세대 전월세·매매 실거래가 공개자료", "lawd_cd": config["lawd_cd"],
            "months": months, "trades_available": trades is not None,
            "areas": collect(rents, trades, config, previous)}


# ---------------------------------------------------------------- summarize

def area_band(area: float) -> int:
    return next(i for i, (low, high, _, _) in enumerate(AREA_BANDS) if low <= area < high)


def age_band(build_year: int, as_of_year: int) -> int | None:
    if not build_year:
        return None
    age = max(as_of_year - build_year, 0)
    return next(i for i, (low, high, _) in enumerate(AGE_BANDS) if low <= age <= high)


def jeonse_median(rows: list[list]) -> tuple[int | None, str]:
    jeonse = [r for r in rows if r[4] == 0]
    fresh = [r for r in jeonse if r[5] == "신규"]
    basis = fresh if len(fresh) >= MIN_COUNT else jeonse
    if len(basis) < MIN_COUNT:
        return None, ""
    return int(statistics.median(r[3] for r in basis)), ("신규" if basis is fresh else "전체")


def wolse_median(rows: list[list]) -> tuple[int | None, int | None]:
    wolse = [r for r in rows if r[4] > 0]
    if len(wolse) < MIN_COUNT:
        return None, None
    return int(statistics.median(r[3] for r in wolse)), int(statistics.median(r[4] for r in wolse))


def summarize(slot: dict, months: list[str], as_of_year: int) -> dict:
    rents, trades = slot["rents"], slot["trades"]
    bands = []
    for i, (_, _, label, hint) in enumerate(AREA_BANDS):
        rows = [r for r in rents if area_band(r[1]) == i]
        sales = [t for t in trades if area_band(t[1]) == i]
        j, basis = jeonse_median(rows)
        deposit, monthly = wolse_median(rows)
        sale = int(statistics.median(t[3] for t in sales)) if len(sales) >= MIN_COUNT else None
        bands.append({"label": label, "hint": hint, "count": len(rows), "jeonse_count": sum(1 for r in rows if r[4] == 0),
                      "wolse_count": sum(1 for r in rows if r[4] > 0), "jeonse": j, "basis": basis,
                      "wolse_deposit": deposit, "wolse_monthly": monthly, "sale": sale, "sale_count": len(sales),
                      "cells": [jeonse_median([r for r in rows if age_band(r[6], as_of_year) == a])[0] for a in range(len(AGE_BANDS))],
                      "wolse_cells": [wolse_median([r for r in rows if age_band(r[6], as_of_year) == a]) for a in range(len(AGE_BANDS))]})
    per_month = Counter(r[0][:7].replace("-", "") for r in rents)
    return {"count": len(rents), "jeonse": sum(1 for r in rents if r[4] == 0), "wolse": sum(1 for r in rents if r[4] > 0),
            "new": sum(1 for r in rents if r[5] == "신규"), "bands": bands,
            "top": max(bands, key=lambda b: b["count"]),
            "monthly": [(ym, per_month.get(ym, 0)) for ym in months]}


# ---------------------------------------------------------------- render

def floor_label(floor: int) -> str:
    return f"지하 {-floor}층" if floor < 0 else f"{floor}층"


def _money(value: int | None) -> str:
    return e(format_price(value)) if value else "—"


def render_area_page(area: dict, slot: dict, months: list[str], as_of: str, siblings: list[dict]) -> str:
    umd, slug = area["umd"], area["slug"]
    summary = summarize(slot, months, int(as_of[:4]))
    top = summary["top"]
    url = f"{SITE}/villas/{slug}.html"
    has_sales = any(b["sale"] for b in summary["bands"])
    kinds = "전세·월세·매매" if has_sales else "전세·월세"
    title = f"{umd} 빌라 {kinds} 실거래가 | 원룸·투룸 시세 | 송파구 | 롯데부동산"
    share = round(summary["wolse"] / summary["count"] * 100) if summary["count"] else 0
    lead = (f"최근 13개월({apt._period(months)}) 동안 송파구 {umd} 연립·다세대(빌라)에서 전월세 {summary['count']:,}건이 신고됐고, "
            f"이 중 월세가 {share}%입니다. 가장 많이 계약된 면적대는 전용 {top['label']}({top['hint']})입니다.")
    medians = []
    if top["wolse_monthly"]:
        medians.append(f"월세 보증금 {format_price(top['wolse_deposit'])}·월 {format_price(top['wolse_monthly'])}")
    if top["jeonse"]:
        medians.append(f"전세 {format_price(top['jeonse'])}")
    if medians:
        lead += f" 이 면적대 중간값은 {', '.join(medians)}입니다."
    description = (f"송파구 {umd} 빌라(연립·다세대) 전월세 실거래 {summary['count']:,}건을 면적대·준공연도별 전세·월세 중간값과 "
                   "월별 계약 건수, 최근 계약 목록으로 정리했습니다. 국토교통부 공개자료 기준.")
    ld = [apt._breadcrumb_ld([("롯데부동산", f"{SITE}/"), ("송파 빌라 실거래가", f"{SITE}/{HUB_NAME}"),
                              (f"{umd} 빌라 실거래가", url)])]

    band_rows = "\n".join(
        f'            <tr><th scope="row">전용 {e(b["label"])}<small>{e(b["hint"])}</small></th>'
        f'<td>{_money(b["wolse_deposit"])} / {_money(b["wolse_monthly"])}<small>보증금 / 월세</small></td>'
        f'<td>{_money(b["jeonse"])}{f"<small>{b["basis"]} 기준</small>" if b["jeonse"] else ""}</td>'
        f'<td>{b["wolse_count"]:,} / {b["jeonse_count"]:,}건</td></tr>'
        for b in summary["bands"] if b["count"])
    age_head = "".join(f'<th scope="col">{e(label)}</th>' for _, _, label in AGE_BANDS)
    wolse_matrix = "\n".join(
        f'            <tr><th scope="row">전용 {e(b["label"])}</th>' + "".join(
            f'<td class="ap-wrap">{_money(m)}<small>보증금 {_money(d)}</small></td>' if m else "<td>—</td>" for d, m in b["wolse_cells"]) + "</tr>"
        for b in summary["bands"] if b["count"])
    jeonse_matrix = "\n".join(
        f'            <tr><th scope="row">전용 {e(b["label"])}</th>' + "".join(f'<td class="ap-wrap">{_money(c)}</td>' for c in b["cells"]) + "</tr>"
        for b in summary["bands"] if b["count"])
    peak = max((count for _, count in summary["monthly"]), default=0) or 1
    bars = "\n".join(
        f'          <li><span class="ap-bar" style="--h:{round(count / peak * 100)}%"></span><strong>{count}</strong><small>{ym[2:4]}.{int(ym[4:])}</small></li>'
        for ym, count in summary["monthly"])
    recent = "\n".join(
        f'            <tr><td>{e(format_date(r[0]))}</td><td class="ap-wrap">{e(apt.format_rent(r))}<small>{e(apt.rent_label(r))}</small></td>'
        f'<td>{r[1]:g}㎡<small>{floor_label(r[2])}</small></td><td>{r[6] or "—"}</td></tr>'
        for r in slot["rents"][:20])

    sale_section = ""
    if has_sales:
        sale_rows = "\n".join(
            f'            <tr><th scope="row">전용 {e(b["label"])}</th><td>{_money(b["sale"])}</td><td>{b["sale_count"]}건</td>'
            f'<td>{f"{round(b["jeonse"] / b["sale"] * 100)}%" if b["sale"] and b["jeonse"] else "—"}</td></tr>'
            for b in summary["bands"] if b["sale_count"])
        sale_section = f"""    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">매매</p><h2>{e(umd)} 빌라 매매 실거래</h2><p class="lr-lead">전세 비율은 같은 면적대의 전세 중간값을 매매 중간값으로 나눈 참고치입니다. 건물마다 다르므로 계약하려는 집의 전세가율은 그 집의 매매 시세로 따로 확인해야 합니다.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th scope="col">면적대</th><th scope="col">매매 중간값</th><th scope="col">거래</th><th scope="col">전세 비율(참고)</th></tr></thead>
            <tbody>
{sale_rows}
            </tbody>
          </table>
        </div>
      </div>
    </section>

"""
    guide = apt.GUIDE_AREAS.get(umd)
    sibling_links = "".join(f'<li><a href="{e(s["slug"])}.html">{e(s["umd"])} 빌라 실거래가</a><span>13개월 전월세 {s["count"]:,}건</span></li>' for s in siblings)
    if umd == OFFICE_UMD:
        cta_kicker, cta_title = f"{umd} 현장 사무소", f"{umd} 빌라, 걸어서 같이 보러 갑니다"
        cta_where = f"롯데부동산은 {umd}(백제고분로27길)에 있습니다."
    else:
        cta_kicker, cta_title = "가까운 현장 사무소", f"{umd} 빌라, 가까이서 같이 보러 갑니다"
        cta_where = f"롯데부동산은 {umd}과 맞닿은 {OFFICE_UMD}(백제고분로27길)에 있습니다." if umd in OFFICE_NEIGHBOURS else f"롯데부동산은 송파구 {OFFICE_UMD}(백제고분로27길)에 있습니다."
    body = f"""  <main>
    <div class="lr-breadcrumb"><div class="lr-container"><nav aria-label="현재 위치"><a href="../">홈</a> › <a href="../{HUB_NAME}">송파 빌라 실거래가</a> › <span>{e(umd)}</span></nav></div></div>

    <section class="lr-section ap-hero">
      <div class="lr-container">
        <p class="lr-kicker">송파구 {e(umd)} 연립·다세대 실거래가</p>
        <h1>{e(umd)} 빌라 {e(kinds)} 실거래가</h1>
        <p class="lr-lead">{e(lead)}</p>
        <div class="ap-stats">
          <div class="lr-stat-pill"><span>13개월 전월세</span><strong>{summary['count']:,}건</strong></div>
          <div class="lr-stat-pill"><span>월세 / 전세</span><strong>{summary['wolse']:,} / {summary['jeonse']:,}</strong></div>
          <div class="lr-stat-pill"><span>신규 계약</span><strong>{summary['new']:,}건</strong><small>나머지는 갱신</small></div>
          <div class="lr-stat-pill"><span>최근 계약</span><strong>{e(format_date(slot['rents'][0][0]))}</strong></div>
        </div>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">면적대별 시세</p><h2>{e(umd)} 빌라 면적대별 전월세 중간값</h2><p class="lr-lead">방 개수는 공개자료에 없어 전용면적으로만 나눴습니다. 원룸·투룸 표기는 대략적인 기준입니다. 계약이 {MIN_COUNT}건 미만인 칸은 비워 두었습니다.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th scope="col">면적대</th><th scope="col">월세 중간값</th><th scope="col">전세 중간값</th><th scope="col">월세 / 전세</th></tr></thead>
            <tbody>
{band_rows}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="lr-section lr-section--muted">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">준공연도별</p><h2>신축과 구축, 얼마나 다를까요?</h2><p class="lr-lead">같은 면적대라도 준공 10년 이내 신축은 엘리베이터·주차·단열 조건이 달라 시세 차이가 큽니다. 건물 나이는 {e(as_of[:4])}년 기준입니다.</p></div></div>
        <h3 class="ap-group-title">월세 중간값 (월세 / 보증금)</h3>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col">면적대</th>{age_head}</tr></thead>
            <tbody>
{wolse_matrix}
            </tbody>
          </table>
        </div>
        <h3 class="ap-group-title ap-subhead">전세 중간값</h3>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col">면적대</th>{age_head}</tr></thead>
            <tbody>
{jeonse_matrix}
            </tbody>
          </table>
        </div>
      </div>
    </section>

{sale_section}    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">월별 계약</p><h2>월별 전월세 신고 건수</h2><p class="lr-lead">가장 최근 달은 아직 신고 기한이 남아 있어 적게 보일 수 있습니다.</p></div></div>
        <ol class="ap-bars" aria-label="월별 전월세 건수">
{bars}
        </ol>
      </div>
    </section>

    <section class="lr-section lr-section--muted">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">최근 계약</p><h2>최근 전월세 {min(20, len(slot['rents']))}건</h2><p class="lr-lead">건물명과 지번은 싣지 않았습니다.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col">계약일</th><th scope="col">보증금 / 월세</th><th scope="col">전용</th><th scope="col">준공</th></tr></thead>
            <tbody>
{recent}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">계약 전 확인</p><h2>빌라 전세·월세, 시세 말고 꼭 볼 것</h2></div></div>
        <ul class="ap-siblings">
          <li><strong>등기부 선순위</strong><span>근저당·가압류 금액과 내 보증금을 더해 집값의 몇 %인지 봅니다. 빌라는 매매 시세가 불분명해 이 비율이 가장 중요합니다.</span></li>
          <li><strong>보증보험 가입 가능 여부</strong><span>전세라면 계약 전에 전세보증금 반환보증 가입 요건을 먼저 확인합니다.</span></li>
          <li><strong>건축물대장 용도</strong><span>위반건축물·근린생활시설 표기 여부에 따라 대출과 보증 가입이 막힐 수 있습니다.</span></li>
        </ul>
        <p class="ap-links">{f'<a href="../songpa-neighborhood-guide.html#area-{guide}">{e(umd)} 생활권 안내</a> · ' if guide else ''}<a href="../{apt.HUB_NAME}">송파 아파트 실거래가</a> · <a href="../brokerage-fee-calculator.html">중개보수 계산기</a></p>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">다른 동 비교</p><h2>가까운 송파 빌라 실거래가</h2></div></div>
        <ul class="ap-siblings">{sibling_links}</ul>
      </div>
    </section>

{apt._sources_note(months, as_of).replace("국토교통부 아파트 매매·전월세 실거래가 공개자료", "국토교통부 연립다세대 전월세·매매 실거래가 공개자료")}
    <section class="lr-section">
      <div class="lr-container lr-cta">
        <div><p class="lr-kicker">{e(cta_kicker)}</p><h2>{e(cta_title)}</h2><p class="lr-lead">{e(cta_where)} 실거래가에 없는 주차·엘리베이터·채광과 등기부 확인을 현장에서 함께 봐 드립니다. 주소·계약서 원문은 공개 입력창에 올리지 마세요.</p><div class="lr-actions"><a class="lr-btn lr-btn--primary" href="../contact.html#inquiry-options">{e(umd)} 빌라 상담 문의</a><a class="lr-btn lr-btn--ghost" href="../listings.html">현재 매물 보기</a></div></div>
      </div>
    </section>
  </main>

"""
    return apt._head(title, description, url, "../", ld) + body + apt._foot("../")


def render_hub(rows: list[dict], months: list[str], as_of: str) -> str:
    url = f"{SITE}/{HUB_NAME}"
    total = sum(r["summary"]["count"] for r in rows)
    names = "·".join(r["umd"] for r in rows)
    title = f"송파구 빌라 전세·월세 실거래가 | 동별 원룸·투룸 시세 ({names}) | 롯데부동산"
    description = (f"송파구 {names} 연립·다세대(빌라) 전월세 실거래 {total:,}건을 동별·면적대별 월세와 전세 중간값으로 비교했습니다. "
                   "국토교통부 공개자료 기준.")
    ld = [apt._breadcrumb_ld([("롯데부동산", f"{SITE}/"), ("송파 빌라 실거래가", url)]),
          {"@context": "https://schema.org", "@type": "ItemList", "name": "송파구 동별 빌라 실거래가",
           "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": f"{r['umd']} 빌라 실거래가",
                                "url": f"{SITE}/villas/{r['slug']}.html"} for i, r in enumerate(rows)]}]

    def cell(band: dict) -> str:
        wolse = f'{_money(band["wolse_monthly"])}<small>보증금 {_money(band["wolse_deposit"])}</small>' if band["wolse_monthly"] else "—"
        return f'<td class="ap-wrap">{wolse}</td><td class="ap-wrap">{_money(band["jeonse"])}</td>'

    table_rows = "\n".join(
        f'            <tr><th scope="row"><a href="villas/{e(r["slug"])}.html">{e(r["umd"])}</a><small>{r["summary"]["count"]:,}건 · 월세 {round(r["summary"]["wolse"] / r["summary"]["count"] * 100)}%</small></th>'
        f'{cell(r["summary"]["bands"][0])}{cell(r["summary"]["bands"][1])}</tr>'
        for r in rows)
    body = f"""  <main>
    <section class="lr-section ap-hero">
      <div class="lr-container">
        <p class="lr-kicker">국토교통부 공개자료</p>
        <h1>송파구 빌라 전세·월세 실거래가</h1>
        <p class="lr-lead">송파구 {e(names)} 연립·다세대(빌라)의 최근 13개월({e(apt._period(months))}) 전월세 신고 {total:,}건을 동별로 모았습니다. 동 이름을 누르면 면적대·준공연도별 시세와 최근 계약을 볼 수 있습니다.</p>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">동별 비교</p><h2>원룸·투룸 동별 중간값</h2><p class="lr-lead">원룸은 전용 30㎡ 미만, 투룸은 30~50㎡ 기준의 대략적인 구분입니다. 월세는 보증금 수준이 제각각이라 보증금 중간값을 함께 봐야 합니다.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col" rowspan="2">동</th><th scope="col" colspan="2">원룸 (30㎡ 미만)</th><th scope="col" colspan="2">투룸 (30~50㎡)</th></tr>
            <tr><th scope="col">월세</th><th scope="col">전세</th><th scope="col">월세</th><th scope="col">전세</th></tr></thead>
            <tbody>
{table_rows}
            </tbody>
          </table>
        </div>
        <p class="ap-links">아파트를 찾으신다면 <a href="{apt.HUB_NAME}">송파 아파트 단지별 실거래가</a>를 함께 보세요.</p>
      </div>
    </section>

{apt._sources_note(months, as_of).replace("국토교통부 아파트 매매·전월세 실거래가 공개자료", "국토교통부 연립다세대 전월세·매매 실거래가 공개자료")}
    <section class="lr-section">
      <div class="lr-container lr-cta">
        <div><p class="lr-kicker">{OFFICE_UMD} 현장 사무소</p><h2>송파 빌라, 현장에서 같이 확인하세요</h2><p class="lr-lead">실거래가에 없는 주차·엘리베이터·채광과 등기부 선순위는 현장과 서류로 확인해야 합니다. 주소·계약서 원문은 공개 입력창에 올리지 마세요.</p><div class="lr-actions"><a class="lr-btn lr-btn--primary" href="contact.html#inquiry-options">빌라 전월세 상담 문의</a><a class="lr-btn lr-btn--ghost" href="songpa-neighborhood-guide.html">송파 동네 선택 도우미</a></div></div>
      </div>
    </section>
  </main>

"""
    return apt._head(title, description, url, "", ld) + body + apt._foot("")


def build_site(data: dict, config: dict) -> dict[Path, str]:
    """Pure: data + config -> {path: content} for every generated file."""
    months = data["months"]
    outputs: dict[Path, str] = {}
    rows = []
    for area in config["areas"]:
        if not apt.SAFE_SLUG.match(area["slug"]):
            raise RuntimeError(f"unsafe slug: {area['slug']}")
        slot = data["areas"].get(area["slug"])
        if not slot or not slot["rents"]:
            continue
        as_of = max(r[0][0] for r in (slot["rents"], slot["trades"]) if r)
        rows.append({**area, "slot": slot, "as_of": as_of, "summary": summarize(slot, months, int(as_of[:4]))})
    if not rows:
        return outputs
    hub_as_of = max(r["as_of"] for r in rows)
    entries = [(f"{SITE}/{HUB_NAME}", hub_as_of)]
    for row in rows:
        siblings = [{"slug": r["slug"], "umd": r["umd"], "count": r["summary"]["count"]} for r in rows if r is not row]
        outputs[PAGES / f"{row['slug']}.html"] = render_area_page(row, row["slot"], months, row["as_of"], siblings)
        entries.append((f"{SITE}/villas/{row['slug']}.html", row["as_of"]))
    outputs[HUB] = render_hub(rows, months, hub_as_of)
    outputs[SITEMAP] = apt.update_sitemap(SITEMAP.read_text(encoding="utf-8"), entries, SITEMAP_PATTERN)
    return outputs


def write_outputs(outputs: dict[Path, str]) -> list[str]:
    changed = []
    PAGES.mkdir(parents=True, exist_ok=True)
    expected = {p for p in outputs if p.parent == PAGES}
    for stale in PAGES.glob("*.html"):
        if stale not in expected:
            stale.unlink()
            changed.append(str(stale.relative_to(REPO)))
    for path, content in outputs.items():
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            path.write_text(content, encoding="utf-8")
            changed.append(str(path.relative_to(REPO)))
    return changed


def save_data(data: dict) -> bool:
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if DATA.exists() and DATA.read_text(encoding="utf-8") == text:
        return False
    DATA.write_text(text, encoding="utf-8")
    return True


def render() -> list[str]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    data = json.loads(DATA.read_text(encoding="utf-8"))
    return write_outputs(build_site(data, config))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["fetch", "render", "refresh"])
    parser.add_argument("--env", type=Path, default=Path(os.environ.get("LOTTEREAL_ENV", "/opt/data/.env")))
    parser.add_argument("--today", type=date.fromisoformat, default=date.today())
    args = parser.parse_args(argv)
    changed: list[str] = []
    if args.command in ("fetch", "refresh"):
        if save_data(fetch(args.env, args.today)):
            changed.append(str(DATA.relative_to(REPO)))
    if args.command in ("render", "refresh"):
        changed.extend(render())
    print(json.dumps({"ok": True, "changed": bool(changed), "files": len(changed)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
