#!/usr/bin/env python3
"""Songpa apartment trade-price pages built from MOLIT's public RTMS open API.

  fetch   pull the last 13 months of Songpa apartment trades and rents into data/songpa-apt-trades.v1.json
  render  write public/apartments/<slug>.html, the hub page and their sitemap entries from that file
  refresh fetch + render; prints one JSON line with "changed"

The service key is read from Data_Gov in /opt/data/.env and never printed. Only the
fields MOLIT already publishes per trade (contract date, exclusive area, floor, price,
brokered/direct; for rents: contract date, area, floor, deposit, monthly rent, new/renewal)
are kept; buyer/seller types, unit numbers, previous rents and cancelled trades are dropped.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import statistics
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CONFIG = REPO / "data" / "songpa-apt-complexes.v1.json"
DATA = REPO / "data" / "songpa-apt-trades.v1.json"
PUBLIC = REPO / "public"
PAGES = PUBLIC / "apartments"
HUB = PUBLIC / "songpa-apartment-prices.html"
SITEMAP = PUBLIC / "Sitemap.xml"
SITE = "https://lottes.co.kr"
HUB_NAME = "songpa-apartment-prices.html"
ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
RENT_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
MONTHS = 13
SAFE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
GUIDE_AREAS = {"잠실동": "jamsil", "삼전동": "samjeon", "석촌동": "seokchon", "송파동": "songpa",
               "방이동": "bangi", "가락동": "garak", "문정동": "munjeong"}
JAMSIL_AREA = {"잠실동", "신천동"}


# ---------------------------------------------------------------- fetch

def load_key(env_path: Path) -> str:
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("Data_Gov="):
            value = line.split("=", 1)[1].strip().strip('"').strip("'")
            if value:
                return value
    raise RuntimeError("Data_Gov key missing from env file")


def month_window(end: date, months: int = MONTHS) -> list[str]:
    year, month = end.year, end.month
    out = []
    for _ in range(months):
        out.append(f"{year}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return sorted(out)


def _text(item: ET.Element, tag: str) -> str:
    return (item.findtext(tag) or "").strip()


def _manwon(item: ET.Element, tag: str) -> int:
    return int(_text(item, tag).replace(",", "") or 0)


def _parse_items(body: bytes) -> tuple[ET.Element, list[tuple[ET.Element, dict]]]:
    root = ET.fromstring(body)
    code = (root.findtext(".//resultCode") or "").strip()
    if code not in ("000", "00"):
        raise RuntimeError(f"RTMS error {code}: {(root.findtext('.//resultMsg') or '').strip()}")
    rows = []
    for item in root.iter("item"):
        rows.append((item, {
            "umd": _text(item, "umdNm"),
            "apt_nm": _text(item, "aptNm"),
            "build_year": _text(item, "buildYear"),
            "date": f"{int(_text(item, 'dealYear')):04d}-{int(_text(item, 'dealMonth')):02d}-{int(_text(item, 'dealDay')):02d}",
            "area": round(float(_text(item, "excluUseAr")), 2),
            "floor": int(_text(item, "floor") or 0),
        }))
    return root, rows


def parse_trade_xml(body: bytes) -> tuple[list[dict], int]:
    root, rows = _parse_items(body)
    trades = [{**base, "amount": _manwon(item, "dealAmount"), "direct": _text(item, "dealingGbn") == "직거래",
               "cancelled": bool(_text(item, "cdealType"))} for item, base in rows]
    return trades, int(root.findtext(".//totalCount") or 0)


def parse_rent_xml(body: bytes) -> tuple[list[dict], int]:
    root, rows = _parse_items(body)
    rents = [{**base, "deposit": _manwon(item, "deposit"), "monthly": _manwon(item, "monthlyRent"),
              "kind": _text(item, "contractType") if _text(item, "contractType") in ("신규", "갱신") else ""}
             for item, base in rows]
    return rents, int(root.findtext(".//totalCount") or 0)


def fetch_month(key: str, lawd_cd: str, ym: str, endpoint: str = ENDPOINT, parser=parse_trade_xml) -> list[dict]:
    trades, page = [], 1
    while True:
        query = urllib.parse.urlencode({"LAWD_CD": lawd_cd, "DEAL_YMD": ym, "numOfRows": 1000, "pageNo": page})
        url = f"{endpoint}?serviceKey={urllib.parse.quote(key, safe='')}&{query}"
        try:
            body = urllib.request.urlopen(url, timeout=30).read()
        except Exception as error:  # keep the key out of tracebacks
            raise RuntimeError(f"RTMS request failed for {ym}: {type(error).__name__} {getattr(error, 'code', '')}") from None
        batch, total = parser(body)
        trades.extend(batch)
        if page * 1000 >= total or not batch:
            return trades
        page += 1


def collect(trades: list[dict], config: dict) -> dict:
    by_key = {(c["umd"], c["apt_nm"]): c for c in config["complexes"]}
    complexes: dict[str, dict] = {}
    for trade in trades:
        if trade["cancelled"]:
            continue
        entry = by_key.get((trade["umd"], trade["apt_nm"]))
        if not entry:
            continue
        slot = complexes.setdefault(entry["slug"], {"build_year": trade["build_year"], "trades": []})
        slot["trades"].append([trade["date"], trade["area"], trade["floor"], trade["amount"], "직거래" if trade["direct"] else "중개"])
    for slot in complexes.values():
        slot["trades"].sort(key=lambda row: (row[0], row[3]), reverse=True)
    return complexes


def collect_rents(rents: list[dict], config: dict, complexes: dict) -> dict:
    by_key = {(c["umd"], c["apt_nm"]): c for c in config["complexes"]}
    for rent in rents:
        entry = by_key.get((rent["umd"], rent["apt_nm"]))
        if not entry:
            continue
        slot = complexes.setdefault(entry["slug"], {"build_year": rent["build_year"], "trades": []})
        slot.setdefault("rents", []).append([rent["date"], rent["area"], rent["floor"], rent["deposit"], rent["monthly"], rent["kind"]])
    for slot in complexes.values():
        slot.get("rents", []).sort(key=lambda row: (row[0], row[3], row[4]), reverse=True)
    return complexes


def fetch(env_path: Path, today: date) -> dict:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    key = load_key(env_path)
    months = month_window(today)
    trades, rents = [], []
    for ym in months:
        trades.extend(fetch_month(key, config["lawd_cd"], ym))
        rents.extend(fetch_month(key, config["lawd_cd"], ym, RENT_ENDPOINT, parse_rent_xml))
    return {"source": "국토교통부 아파트 매매·전월세 실거래가 공개자료", "lawd_cd": config["lawd_cd"],
            "months": months, "complexes": collect_rents(rents, config, collect(trades, config))}


# ---------------------------------------------------------------- summarize

def format_price(manwon: int) -> str:
    eok, rest = divmod(int(manwon), 10000)
    if eok and rest:
        return f"{eok}억 {rest:,}만"
    if eok:
        return f"{eok}억"
    return f"{rest:,}만"


def format_date(iso: str) -> str:
    year, month, day = iso.split("-")
    return f"{year}.{month}.{day}"


def area_band(area: float) -> int:
    return int(area)


def summarize(trades: list[list], months: list[str]) -> dict:
    bands: dict[int, list[list]] = defaultdict(list)
    for row in trades:
        bands[area_band(row[1])].append(row)
    band_rows = []
    for band, rows in bands.items():
        amounts = [row[3] for row in rows]
        band_rows.append({"band": band, "count": len(rows), "latest": rows[0],
                          "median": int(statistics.median(amounts)), "min": min(amounts), "max": max(amounts)})
    band_rows.sort(key=lambda b: b["band"])
    per_month = Counter(row[0][:7].replace("-", "") for row in trades)
    return {
        "count": len(trades),
        "latest": trades[0] if trades else None,
        "bands": band_rows,
        "top_band": max(band_rows, key=lambda b: (b["count"], b["band"])) if band_rows else None,
        "monthly": [(ym, per_month.get(ym, 0)) for ym in months],
    }


def summarize_rents(rents: list[list]) -> dict:
    """Per-area jeonse/wolse medians. Jeonse uses new contracts when there are at least
    three, because renewals under the 5% renewal cap sit below the going rate."""
    bands: dict[int, list[list]] = defaultdict(list)
    for row in rents:
        bands[area_band(row[1])].append(row)
    band_rows = []
    for band, rows in sorted(bands.items()):
        jeonse = [r for r in rows if r[4] == 0]
        fresh = [r for r in jeonse if r[5] == "신규"]
        basis = fresh if len(fresh) >= 3 else jeonse
        wolse = [r for r in rows if r[4] > 0]
        band_rows.append({
            "band": band, "count": len(rows), "jeonse_count": len(jeonse), "wolse_count": len(wolse),
            "jeonse_median": int(statistics.median(r[3] for r in basis)) if basis else None,
            "jeonse_basis": ("신규" if basis is fresh else "전체") if basis else "",
            "wolse_deposit": int(statistics.median(r[3] for r in wolse)) if wolse else None,
            "wolse_monthly": int(statistics.median(r[4] for r in wolse)) if wolse else None,
        })
    return {"count": len(rents), "jeonse": sum(b["jeonse_count"] for b in band_rows),
            "wolse": sum(b["wolse_count"] for b in band_rows), "bands": band_rows,
            "by_band": {b["band"]: b for b in band_rows}}


def jeonse_ratio(sale_median: int | None, jeonse_median: int | None) -> int | None:
    return round(jeonse_median / sale_median * 100) if jeonse_median and sale_median else None


def format_rent(row: list) -> str:
    deposit, monthly = row[3], row[4]
    return format_price(deposit) if monthly == 0 else f"{format_price(deposit)} / {format_price(monthly)}"


def rent_label(row: list) -> str:
    return " · ".join(part for part in ("전세" if row[4] == 0 else "월세", row[5]) if part)


# ---------------------------------------------------------------- render

e = html.escape


def _period(months: list[str]) -> str:
    first, last = months[0], months[-1]
    return f"{first[:4]}년 {int(first[4:])}월~{last[:4]}년 {int(last[4:])}월"


def _head(title: str, description: str, canonical: str, prefix: str, ld: list[dict]) -> str:
    ld_tags = "\n".join(f'  <script type="application/ld+json">{json.dumps(obj, ensure_ascii=False, separators=(",", ":"))}</script>' for obj in ld)
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; script-src 'self' https://www.googletagmanager.com https://wcs.pstatic.net; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://wcs.naver.com; form-action 'self'; upgrade-insecure-requests">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <script src="{prefix}js/privacyAnalytics.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>{e(title)}</title>
  <meta name="description" content="{e(description)}">
  <link rel="canonical" href="{e(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:url" content="{e(canonical)}">
  <meta property="og:image" content="{SITE}/img/bg-img/lotte_street_view.png">
  <meta name="twitter:card" content="summary_large_image">
{ld_tags}
  <link rel="icon" href="{prefix}img/core-img/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" data-async-style>
  <noscript><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"></noscript>
  <script src="{prefix}js/asyncStyles.js" defer></script>
  <link rel="stylesheet" href="{prefix}style.css">
  <link rel="stylesheet" href="{prefix}css/mobile.css">
  <link rel="stylesheet" href="{prefix}css/apartment-prices.css">
</head>
<body>
  <header class="lr-header">
    <div class="lr-container">
      <div class="lr-brand"><a href="{prefix or './'}">롯데부동산</a></div>
      <button class="lr-hamburger" aria-label="메뉴" aria-expanded="false">☰</button>
      <nav class="lr-nav" aria-label="주요 메뉴">
        <a href="{prefix}corporate-buildings.html">기업 사옥</a>
        <a href="{prefix}listings.html">매물 찾기</a>
        <a href="{prefix}report.html">시장·정책</a>
        <a href="{prefix}disputes.html">계약 사례</a>
        <a href="{prefix}knowledge.html">자료 찾기</a>
        <a href="{prefix}contact.html" class="lr-nav-cta">문의·방문</a>
      </nav>
    </div>
  </header>
"""


def _foot(prefix: str) -> str:
    return f"""  <footer class="lr-footer">
    <div class="lr-container lr-footer__content">
      <div><p class="lr-kicker">롯데부동산</p><p class="lr-text">서울시 송파구 백제고분로27길 27 1층</p><p class="lr-text">문의전화 0507-1402-5055</p></div>
      <div class="lr-footer__links"><a href="{prefix}{HUB_NAME}">송파 아파트 실거래가</a><a href="{prefix}villas/samjeon.html">삼전동 빌라 전월세</a><a href="{prefix}songpa-neighborhood-guide.html">송파 동네 선택</a><a href="{prefix}brokerage-fee-calculator.html">중개보수 계산기</a><a href="{prefix}privacy.html">개인정보처리방침</a><a href="{prefix}contact.html">문의</a></div>
    </div>
  </footer>
  <script src="{prefix}js/analyticsEvents.js"></script>
  <script src="{prefix}js/mobileNav.js"></script>
  <script src="{prefix}js/phoneHandoff.js"></script>
  <div class="lr-mobile-actionbar" aria-label="빠른 상담 메뉴">
    <a href="tel:050714025055"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg></span><strong>전화상담</strong></a>
    <a href="{prefix}contact.html#inquiry-options"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 5h16v11H9l-5 4z"/></svg></span><strong>문의하기</strong></a>
    <a href="{prefix}listings.html"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M3 11l9-7 9 7M5 10v10h14V10"/></svg></span><strong>매물보기</strong></a>
    <a href="{prefix}contact.html"><span><svg class="lr-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg></span><strong>오시는 길</strong></a>
  </div>
</body>
</html>
"""


def _breadcrumb_ld(items: list[tuple[str, str]]) -> dict:
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": name, "item": url}
                                for i, (name, url) in enumerate(items)]}


def _sources_note(months: list[str], as_of: str) -> str:
    return f"""    <section class="lr-section lr-section--muted">
      <div class="lr-container">
        <div class="lr-disclaimer"><strong>자료 기준과 읽는 법</strong><br>국토교통부 아파트 매매·전월세 실거래가 공개자료(송파구, {e(_period(months))} 계약분)를 {e(format_date(as_of))} 계약분까지 반영했습니다. 실거래 신고는 계약 후 30일 안에 하므로 최근 한 달은 건수가 적게 보일 수 있고, 해제(취소)된 매매는 뺐습니다. 전월세는 보증금 6천만 원 또는 월세 30만 원을 넘는 계약이 신고 대상이라 소액 계약은 빠질 수 있습니다. 계약갱신요구권을 쓴 갱신은 인상 폭이 5% 이내로 묶여 시세보다 낮게 나오므로, 전세 중간값은 신규 계약이 3건 이상이면 신규만으로 계산했습니다. 동·호수와 향, 수리 상태는 공개자료에 없어 같은 면적이라도 가격 차이가 큽니다. 이 페이지는 정보 제공 목적이며 매수·매도 권유가 아닙니다. 계약 전에는 <a href="https://rt.molit.go.kr/" target="_blank" rel="noopener noreferrer">국토교통부 실거래가 공개시스템</a>에서 최신 신고분을 다시 확인하세요.</div>
      </div>
    </section>
"""


def render_complex_page(complex_: dict, slot: dict, months: list[str], as_of: str, siblings: list[dict]) -> str:
    name, umd, slug = complex_["name"], complex_["umd"], complex_["slug"]
    trades = slot["trades"]
    summary = summarize(trades, months)
    latest, top = summary["latest"], summary["top_band"]
    rents = slot.get("rents", [])
    rent = summarize_rents(rents)
    top_rent = rent["by_band"].get(top["band"], {})
    ratio = jeonse_ratio(top["median"], top_rent.get("jeonse_median"))
    build_year = slot.get("build_year") or ""
    url = f"{SITE}/apartments/{slug}.html"
    title = f"{name} 실거래가 | 매매·전세 시세 | 송파구 {umd} 아파트 | 롯데부동산"
    lead = (f"최근 13개월({_period(months)}) 동안 {name}에서 매매 {summary['count']}건, 전월세 {rent['count']}건이 신고됐습니다. "
            f"가장 많이 거래된 전용 {top['band']}㎡는 매매 중간값 {format_price(top['median'])}이고, "
            f"최근 거래는 {format_date(top['latest'][0])} {format_price(top['latest'][3])}({top['latest'][2]}층)입니다.")
    if ratio:
        lead += f" 같은 면적 {top_rent['jeonse_basis']} 전세 중간값은 {format_price(top_rent['jeonse_median'])}(매매가의 약 {ratio}%)입니다."
    description = (f"{name}({umd}{', ' + build_year + '년 준공' if build_year else ''}) 매매 실거래 {summary['count']}건과 전월세 {rent['count']}건을 "
                   "면적별 매매·전세 중간값, 전세가율, 월별 거래량, 최근 거래 목록으로 정리했습니다. 국토교통부 공개자료 기준.")
    ld = [
        _breadcrumb_ld([("롯데부동산", f"{SITE}/"), ("송파 아파트 실거래가", f"{SITE}/{HUB_NAME}"), (f"{name} 실거래가", url)]),
        {"@context": "https://schema.org", "@type": "ApartmentComplex", "name": name, "url": url,
         "address": {"@type": "PostalAddress", "addressCountry": "KR", "addressRegion": "서울특별시", "addressLocality": f"송파구 {umd}"}},
    ]
    band_rows = "\n".join(
        f'            <tr><th scope="row">전용 {b["band"]}㎡</th><td>{e(format_price(b["median"]))}</td><td>{e(format_price(b["latest"][3]))}<small>{e(format_date(b["latest"][0]))} · {b["latest"][2]}층</small></td><td>{b["count"]}건</td><td>{e(format_price(b["min"]))} ~ {e(format_price(b["max"]))}</td></tr>'
        for b in summary["bands"])
    peak = max((count for _, count in summary["monthly"]), default=0) or 1
    bars = "\n".join(
        f'          <li><span class="ap-bar" style="--h:{round(count / peak * 100)}%"></span><strong>{count}</strong><small>{ym[2:4]}.{int(ym[4:])}</small></li>'
        for ym, count in summary["monthly"])
    recent_rows = "\n".join(
        f'            <tr><td>{e(format_date(row[0]))}</td><td>{e(format_price(row[3]))}{'<small>직거래</small>' if row[4] == '직거래' else ''}</td><td>{row[1]:g}㎡</td><td>{row[2]}층</td></tr>'
        for row in trades[:20])
    links = []
    if umd in GUIDE_AREAS:
        links.append(f'<a href="../songpa-neighborhood-guide.html#area-{GUIDE_AREAS[umd]}">{e(umd)} 생활권 안내</a>')
    links.append('<a href="../jamsil-market-report.html">잠실 시장 리포트</a>' if umd in JAMSIL_AREA
                 else '<a href="../songpa-market-report.html">송파 시장 리포트</a>')
    links.append('<a href="../brokerage-fee-calculator.html">중개보수 계산기</a>')
    sale_bands = {b["band"]: b for b in summary["bands"]}

    def jeonse_cell(b: dict) -> str:
        return f'{e(format_price(b["jeonse_median"]))}<small>{b["jeonse_basis"]} 기준</small>' if b["jeonse_median"] else "—"

    def ratio_cell(b: dict) -> str:
        value = jeonse_ratio((sale_bands.get(b["band"]) or {}).get("median"), b["jeonse_median"])
        return f"{value}%" if value else "—"

    def wolse_cell(b: dict) -> str:
        return f'{e(format_price(b["wolse_deposit"]))} / {e(format_price(b["wolse_monthly"]))}<small>보증금 / 월세</small>' if b["wolse_count"] else "—"

    rent_rows = "\n".join(
        f'            <tr><th scope="row">전용 {b["band"]}㎡</th><td>{jeonse_cell(b)}</td><td>{ratio_cell(b)}</td><td>{wolse_cell(b)}</td><td>{b["jeonse_count"]} / {b["wolse_count"]}건</td></tr>'
        for b in rent["bands"])
    recent_rent_rows = "\n".join(
        f'            <tr><td>{e(format_date(row[0]))}</td><td class="ap-wrap">{e(format_rent(row))}<small>{e(rent_label(row))}</small></td><td>{row[1]:g}㎡</td><td>{row[2]}층</td></tr>'
        for row in rents[:15])
    rent_section = f"""    <section class="lr-section lr-section--muted" id="rent">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">전세·월세</p><h2>{e(name)} 전월세 실거래</h2><p class="lr-lead">전세가율은 같은 면적의 전세 중간값을 매매 중간값으로 나눈 값입니다. 월세는 보증금과 월세를 각각 중간값으로 보여드립니다.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th scope="col">면적</th><th scope="col">전세 중간값</th><th scope="col">전세가율</th><th scope="col">월세 중간값</th><th scope="col">전세 / 월세</th></tr></thead>
            <tbody>
{rent_rows}
            </tbody>
          </table>
        </div>
        <h3 class="ap-group-title ap-subhead">최근 전월세 {min(15, len(rents))}건</h3>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col">계약일</th><th scope="col">보증금 / 월세</th><th scope="col">전용</th><th scope="col">층</th></tr></thead>
            <tbody>
{recent_rent_rows}
            </tbody>
          </table>
        </div>
      </div>
    </section>

""" if rents else ""
    sibling_links = "".join(f'<li><a href="{e(s["slug"])}.html">{e(s["name"])}</a><span>{e(s["umd"])} · {s["count"]}건</span></li>' for s in siblings)
    body = f"""  <main>
    <div class="lr-breadcrumb"><div class="lr-container"><nav aria-label="현재 위치"><a href="../">홈</a> › <a href="../{HUB_NAME}">송파 아파트 실거래가</a> › <span>{e(name)}</span></nav></div></div>

    <section class="lr-section ap-hero">
      <div class="lr-container">
        <p class="lr-kicker">송파구 {e(umd)} 아파트 실거래가</p>
        <h1>{e(name)} 매매 실거래가</h1>
        <p class="lr-lead">{e(lead)}</p>
        <div class="ap-stats">
          <div class="lr-stat-pill"><span>13개월 매매</span><strong>{summary['count']}건</strong></div>
          <div class="lr-stat-pill"><span>13개월 전월세</span><strong>{rent['count']}건</strong><small>전세 {rent['jeonse']} · 월세 {rent['wolse']}</small></div>
          <div class="lr-stat-pill"><span>최근 매매</span><strong>{e(format_date(latest[0]))}</strong><small>전용 {latest[1]:g}㎡ · {e(format_price(latest[3]))}</small></div>
          <div class="lr-stat-pill"><span>준공</span><strong>{e(build_year)}년</strong><small>{e(umd)}</small></div>
        </div>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">면적별 시세</p><h2>전용면적별 실거래 요약</h2><p class="lr-lead">같은 면적이라도 층·향·동 위치와 수리 상태에 따라 가격 차이가 큽니다. 중간값을 기준으로 보고, 최고·최저는 범위로만 참고하세요.</p></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th scope="col">면적</th><th scope="col">중간값</th><th scope="col">최근 거래</th><th scope="col">거래</th><th scope="col">최저~최고</th></tr></thead>
            <tbody>
{band_rows}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="lr-section lr-section--muted">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">월별 거래량</p><h2>월별 매매 신고 건수</h2><p class="lr-lead">가장 최근 달은 아직 신고 기한이 남아 있어 적게 보일 수 있습니다.</p></div></div>
        <ol class="ap-bars" aria-label="월별 매매 건수">
{bars}
        </ol>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">최근 거래</p><h2>최근 매매 {min(20, len(trades))}건</h2></div></div>
        <div class="ap-table-wrap">
          <table class="ap-table ap-table--compact">
            <thead><tr><th scope="col">계약일</th><th scope="col">거래금액</th><th scope="col">전용</th><th scope="col">층</th></tr></thead>
            <tbody>
{recent_rows}
            </tbody>
          </table>
        </div>
        <p class="ap-links">{' · '.join(links)}</p>
      </div>
    </section>

{rent_section}{_sources_note(months, as_of)}
    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">함께 보는 단지</p><h2>가까운 송파 단지 실거래가</h2></div></div>
        <ul class="ap-siblings">{sibling_links}</ul>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container lr-cta">
        <div><p class="lr-kicker">다음 단계</p><h2>{e(name)} 매물과 시세, 현장에서 확인하세요</h2><p class="lr-lead">실거래가는 이미 끝난 계약입니다. 지금 나와 있는 호가와 동·향별 차이는 현장 중개사가 함께 확인해 드립니다. 주소·계약서 원문은 공개 입력창에 올리지 마세요.</p><div class="lr-actions"><a class="lr-btn lr-btn--primary" href="../contact.html#inquiry-options">{e(name)} 상담 문의</a><a class="lr-btn lr-btn--ghost" href="../listings.html">현재 매물 보기</a></div></div>
      </div>
    </section>
  </main>

"""
    return _head(title, description, url, "../", ld) + body + _foot("../")


def render_hub(rows: list[dict], months: list[str], as_of: str) -> str:
    url = f"{SITE}/{HUB_NAME}"
    total = sum(r["count"] for r in rows)
    names = "·".join(r["name"] for r in sorted(rows, key=lambda r: -r["count"])[:3])
    title = f"송파구 아파트 실거래가 | 단지별 매매·전세 시세 ({names}) | 롯데부동산"
    description = f"송파구 주요 아파트 {len(rows)}개 단지의 최근 13개월 매매 실거래 {total}건을 단지별 매매·전세 중간값과 최근 거래가로 정리했습니다. 국토교통부 공개자료 기준."
    ld = [_breadcrumb_ld([("롯데부동산", f"{SITE}/"), ("송파 아파트 실거래가", url)]),
          {"@context": "https://schema.org", "@type": "ItemList", "name": "송파구 아파트 단지별 실거래가",
           "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": r["name"], "url": f"{SITE}/apartments/{r['slug']}.html"}
                               for i, r in enumerate(rows)]}]
    by_umd: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_umd[row["umd"]].append(row)
    groups = []
    for umd in sorted(by_umd, key=lambda u: (-sum(r["count"] for r in by_umd[u]), u)):
        items = "\n".join(
            f'            <tr><th scope="row"><a href="apartments/{e(r["slug"])}.html">{e(r["name"])}</a><small>{e(r["build_year"])}년 준공</small></th><td>{e(format_price(r["top"]["median"]))}<small>전용 {r["top"]["band"]}㎡ 매매 중간값</small></td><td>{e(format_price(r["jeonse"])) if r["jeonse"] else "—"}<small>{"같은 면적 전세" if r["jeonse"] else "전세 거래 없음"}</small></td><td>{e(format_price(r["latest"][3]))}<small>{e(format_date(r["latest"][0]))} · 전용 {r["latest"][1]:g}㎡</small></td><td>{r["count"]}건</td></tr>'
            for r in sorted(by_umd[umd], key=lambda r: -r["count"]))
        groups.append(f"""        <h3 class="ap-group-title" id="umd-{e(umd)}">{e(umd)}</h3>
        <div class="ap-table-wrap">
          <table class="ap-table">
            <thead><tr><th scope="col">단지</th><th scope="col">주력 면적</th><th scope="col">전세 중간값</th><th scope="col">최근 매매</th><th scope="col">13개월 매매</th></tr></thead>
            <tbody>
{items}
            </tbody>
          </table>
        </div>""")
    body = f"""  <main>
    <section class="lr-section ap-hero">
      <div class="lr-container">
        <p class="lr-kicker">국토교통부 공개자료</p>
        <h1>송파구 아파트 실거래가</h1>
        <p class="lr-lead">송파구에서 거래가 많은 {len(rows)}개 단지의 최근 13개월({e(_period(months))}) 매매 신고 {total}건을 단지별로 모았습니다. 단지명을 누르면 면적별 매매·전세 중간값과 최근 거래 목록을 볼 수 있습니다.</p>
        <p class="ap-links">빌라를 찾으신다면 <a href="villas/samjeon.html">삼전동 빌라 전세·월세 실거래가</a>도 함께 보세요.</p>
      </div>
    </section>

    <section class="lr-section">
      <div class="lr-container">
        <div class="lr-section__head"><div><p class="lr-kicker">동별 단지</p><h2>동별 단지 실거래 요약</h2><p class="lr-lead">주력 면적은 13개월 동안 가장 많이 거래된 전용면적이고, 전세 중간값은 같은 면적의 신규 계약 기준입니다(신규가 3건 미만이면 전체).</p></div></div>
{chr(10).join(groups)}
      </div>
    </section>

{_sources_note(months, as_of)}
    <section class="lr-section">
      <div class="lr-container lr-cta">
        <div><p class="lr-kicker">다음 단계</p><h2>관심 단지의 지금 매물을 확인하세요</h2><p class="lr-lead">실거래가는 지난 계약입니다. 현재 호가와 동·향별 차이는 현장 상담으로 확인해 드립니다.</p><div class="lr-actions"><a class="lr-btn lr-btn--primary" href="contact.html#inquiry-options">단지 상담 문의</a><a class="lr-btn lr-btn--ghost" href="songpa-neighborhood-guide.html">송파 동네 선택 도우미</a></div></div>
      </div>
    </section>
  </main>

"""
    return _head(title, description, url, "", ld) + body + _foot("")


SITEMAP_PATTERN = rf"{re.escape(f'{SITE}/{HUB_NAME}')}|{re.escape(SITE)}/apartments/[^<]+\.html"


def update_sitemap(text: str, entries: list[tuple[str, str]], loc_pattern: str = SITEMAP_PATTERN) -> str:
    """Replace a generator's URLs (those matching loc_pattern) in place, or append them before </urlset>.

    Keeping the block where it was lets several generators share one sitemap without
    reordering each other's entries."""
    if "</urlset>" not in text:
        raise RuntimeError("invalid sitemap: missing </urlset>")
    pattern = rf"\s*<url>\s*<loc>(?:{loc_pattern})</loc>[\s\S]*?</url>"
    block = "".join(f"\n  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>"
                    for loc, lastmod in entries)
    first = re.search(pattern, text)
    if first:
        text = re.sub(pattern, "", text)
        return text[:first.start()] + block + text[first.start():]
    return re.sub(r"\s*</urlset>\s*$", f"{block}\n</urlset>\n", text)


def build_site(data: dict, config: dict) -> dict[Path, str]:
    """Pure: data + config -> {path: content} for every generated file."""
    months = data["months"]
    complexes = [c for c in config["complexes"] if data["complexes"].get(c["slug"], {}).get("trades")]
    for c in complexes:
        if not SAFE_SLUG.match(c["slug"]):
            raise RuntimeError(f"unsafe slug: {c['slug']}")
    def last_contract(slot: dict) -> str:
        return max(rows[0][0] for rows in (slot["trades"], slot.get("rents", [])) if rows)

    as_of = max(last_contract(data["complexes"][c["slug"]]) for c in complexes)
    rows = []
    for c in complexes:
        slot = data["complexes"][c["slug"]]
        summary = summarize(slot["trades"], months)
        rent_band = summarize_rents(slot.get("rents", []))["by_band"].get(summary["top_band"]["band"], {})
        rows.append({**c, "count": summary["count"], "latest": summary["latest"], "top": summary["top_band"],
                     "jeonse": rent_band.get("jeonse_median"), "build_year": slot.get("build_year") or ""})
    outputs: dict[Path, str] = {}
    entries = [(f"{SITE}/{HUB_NAME}", as_of)]
    for c in complexes:
        same = [r for r in rows if r["umd"] == c["umd"] and r["slug"] != c["slug"]]
        others = [r for r in sorted(rows, key=lambda r: -r["count"]) if r["umd"] != c["umd"] and r["slug"] != c["slug"]]
        siblings = (sorted(same, key=lambda r: -r["count"]) + others)[:6]
        slot = data["complexes"][c["slug"]]
        outputs[PAGES / f"{c['slug']}.html"] = render_complex_page(c, slot, months, as_of, siblings)
        entries.append((f"{SITE}/apartments/{c['slug']}.html", last_contract(slot)))
    outputs[HUB] = render_hub(rows, months, as_of)
    outputs[SITEMAP] = update_sitemap(SITEMAP.read_text(encoding="utf-8"), entries)
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
    DATA.parent.mkdir(parents=True, exist_ok=True)
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
