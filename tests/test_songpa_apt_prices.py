import json
import re
import sys
import unittest
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
import songpa_apt_prices as sap  # noqa: E402

SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>
<item><aptNm>잠실엘스</aptNm><buildYear>2008</buildYear><buyerGbn>개인</buyerGbn><cdealType> </cdealType><dealAmount>320,000</dealAmount><dealDay>21</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn><excluUseAr>84.8</excluUseAr><floor>18</floor><jibun>19</jibun><slerGbn>개인</slerGbn><umdNm>잠실동</umdNm></item>
<item><aptNm>잠실엘스</aptNm><buildYear>2008</buildYear><cdealType>O</cdealType><dealAmount>300,000</dealAmount><dealDay>2</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn><excluUseAr>84.8</excluUseAr><floor>3</floor><umdNm>잠실동</umdNm></item>
<item><aptNm>잠실엘스</aptNm><buildYear>2008</buildYear><cdealType> </cdealType><dealAmount>285,500</dealAmount><dealDay>5</dealDay><dealMonth>8</dealMonth><dealYear>2026</dealYear><dealingGbn>직거래</dealingGbn><excluUseAr>59.96</excluUseAr><floor>7</floor><umdNm>잠실동</umdNm></item>
<item><aptNm>없는단지</aptNm><buildYear>1990</buildYear><cdealType> </cdealType><dealAmount>100,000</dealAmount><dealDay>1</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><dealingGbn>중개거래</dealingGbn><excluUseAr>59</excluUseAr><floor>1</floor><umdNm>잠실동</umdNm></item>
</items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>4</totalCount></body></response>""".encode("utf-8")


RENT_XML = """<?xml version="1.0" encoding="utf-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>
<item><aptNm>잠실엘스</aptNm><buildYear>2008</buildYear><contractTerm>26.10~28.10</contractTerm><contractType>신규</contractType><dealDay>3</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>150,000</deposit><excluUseAr>84.8</excluUseAr><floor>12</floor><jibun>19</jibun><monthlyRent>0</monthlyRent><preDeposit> </preDeposit><useRRRight> </useRRRight><umdNm>잠실동</umdNm></item>
<item><aptNm>잠실엘스</aptNm><buildYear>2008</buildYear><contractType>갱신</contractType><dealDay>9</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>50,000</deposit><excluUseAr>59.96</excluUseAr><floor>4</floor><monthlyRent>250</monthlyRent><preDeposit>50,000</preDeposit><useRRRight>사용</useRRRight><umdNm>잠실동</umdNm></item>
<item><aptNm>없는단지</aptNm><buildYear>1990</buildYear><contractType> </contractType><dealDay>1</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>30,000</deposit><excluUseAr>59</excluUseAr><floor>1</floor><monthlyRent>0</monthlyRent><umdNm>잠실동</umdNm></item>
</items><totalCount>3</totalCount></body></response>""".encode("utf-8")


class ParseAndCollectTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(sap.CONFIG.read_text(encoding="utf-8"))

    def test_parse_reads_fields_and_flags(self):
        trades, total = sap.parse_trade_xml(SAMPLE_XML)
        self.assertEqual(total, 4)
        self.assertEqual(trades[0]["date"], "2026-09-21")
        self.assertEqual(trades[0]["amount"], 320000)
        self.assertTrue(trades[1]["cancelled"])
        self.assertTrue(trades[2]["direct"])

    def test_error_response_raises(self):
        body = b'<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED</resultMsg></header></response>'
        with self.assertRaises(RuntimeError):
            sap.parse_trade_xml(body)

    def test_collect_drops_cancelled_unknown_and_party_fields(self):
        trades, _ = sap.parse_trade_xml(SAMPLE_XML)
        collected = sap.collect(trades, self.config)
        self.assertEqual(list(collected), ["jamsil-els"])
        rows = collected["jamsil-els"]["trades"]
        self.assertEqual(rows, [["2026-09-21", 84.8, 18, 320000, "중개"], ["2026-08-05", 59.96, 7, 285500, "직거래"]])
        self.assertNotIn("개인", json.dumps(collected, ensure_ascii=False))

    def test_rents_parse_and_keep_only_published_fields(self):
        rents, total = sap.parse_rent_xml(RENT_XML)
        self.assertEqual(total, 3)
        self.assertEqual((rents[0]["deposit"], rents[0]["monthly"], rents[0]["kind"]), (150000, 0, "신규"))
        self.assertEqual(rents[2]["kind"], "")
        collected = sap.collect_rents(rents, self.config, {})
        self.assertEqual(collected["jamsil-els"]["rents"],
                         [["2026-09-09", 59.96, 4, 50000, 250, "갱신"], ["2026-09-03", 84.8, 12, 150000, 0, "신규"]])
        self.assertEqual(collected["jamsil-els"]["trades"], [])
        self.assertNotIn("사용", json.dumps(collected, ensure_ascii=False))

    def test_config_slugs_are_safe_and_unique(self):
        slugs = [c["slug"] for c in self.config["complexes"]]
        self.assertEqual(len(slugs), len(set(slugs)))
        keys = [(c["umd"], c["apt_nm"]) for c in self.config["complexes"]]
        self.assertEqual(len(keys), len(set(keys)))
        for slug in slugs:
            self.assertRegex(slug, sap.SAFE_SLUG)


class SummaryTest(unittest.TestCase):
    def test_format_price(self):
        self.assertEqual(sap.format_price(320000), "32억")
        self.assertEqual(sap.format_price(417300), "41억 7,300만")
        self.assertEqual(sap.format_price(9500), "9,500만")

    def test_month_window_spans_year_boundary(self):
        months = sap.month_window(date(2026, 2, 3), 4)
        self.assertEqual(months, ["202511", "202512", "202601", "202602"])

    def test_bands_group_by_whole_square_metre(self):
        trades = [["2026-09-02", 84.97, 3, 340000, "중개"], ["2026-09-01", 84.8, 5, 320000, "중개"],
                  ["2026-08-01", 84.88, 9, 330000, "중개"], ["2026-07-01", 59.96, 2, 280000, "중개"]]
        summary = sap.summarize(trades, ["202607", "202608", "202609"])
        self.assertEqual([b["band"] for b in summary["bands"]], [59, 84])
        band84 = summary["bands"][1]
        self.assertEqual((band84["count"], band84["median"], band84["min"], band84["max"]), (3, 330000, 320000, 340000))
        self.assertEqual(band84["latest"][0], "2026-09-02")
        self.assertEqual(summary["top_band"]["band"], 84)
        self.assertEqual(summary["monthly"], [("202607", 1), ("202608", 1), ("202609", 2)])


class RentSummaryTest(unittest.TestCase):
    def test_jeonse_median_prefers_new_contracts_when_enough(self):
        rows = [["2026-09-0%d" % i, 84.9, 5, amount, 0, kind] for i, (amount, kind) in
                enumerate([(150000, "신규"), (160000, "신규"), (170000, "신규"), (100000, "갱신"), (100000, "갱신")], 1)]
        rows.append(["2026-08-01", 84.5, 3, 50000, 300, "신규"])
        band = sap.summarize_rents(rows)["by_band"][84]
        self.assertEqual((band["jeonse_median"], band["jeonse_basis"]), (160000, "신규"))
        self.assertEqual((band["jeonse_count"], band["wolse_count"], band["wolse_monthly"]), (5, 1, 300))

    def test_jeonse_median_falls_back_to_all_contracts(self):
        rows = [["2026-09-01", 59.9, 5, 90000, 0, "신규"], ["2026-09-02", 59.9, 5, 70000, 0, "갱신"]]
        band = sap.summarize_rents(rows)["by_band"][59]
        self.assertEqual((band["jeonse_median"], band["jeonse_basis"]), (80000, "전체"))
        self.assertIsNone(band["wolse_deposit"])

    def test_ratio_and_format(self):
        self.assertEqual(sap.jeonse_ratio(300000, 150000), 50)
        self.assertIsNone(sap.jeonse_ratio(300000, None))
        self.assertEqual(sap.format_rent(["2026-09-01", 84.9, 5, 150000, 0, "신규"]), "15억")
        self.assertEqual(sap.format_rent(["2026-09-01", 84.9, 5, 50000, 250, ""]), "5억 / 250만")
        self.assertEqual(sap.rent_label(["2026-09-01", 84.9, 5, 150000, 0, "신규"]), "전세 · 신규")
        self.assertEqual(sap.rent_label(["2026-09-01", 84.9, 5, 50000, 250, ""]), "월세")


class SitemapTest(unittest.TestCase):
    BASE = """<?xml version="1.0"?>\n<urlset>\n  <url>\n    <loc>https://lottes.co.kr/</loc>\n  </url>\n</urlset>\n"""

    def test_update_is_idempotent_and_keeps_other_urls(self):
        entries = [(f"{sap.SITE}/{sap.HUB_NAME}", "2026-10-01"), (f"{sap.SITE}/apartments/a.html", "2026-09-01")]
        once = sap.update_sitemap(self.BASE, entries)
        self.assertEqual(sap.update_sitemap(once, entries), once)
        self.assertIn("<loc>https://lottes.co.kr/</loc>", once)
        shrunk = sap.update_sitemap(once, entries[:1])
        self.assertNotIn("apartments/a.html", shrunk)


class GeneratedSiteTest(unittest.TestCase):
    """The committed pages are exactly what the committed data renders to."""

    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(sap.CONFIG.read_text(encoding="utf-8"))
        cls.data = json.loads(sap.DATA.read_text(encoding="utf-8"))
        cls.outputs = sap.build_site(cls.data, cls.config)

    def test_committed_files_match_the_renderer(self):
        stale = [str(p.relative_to(REPO)) for p, text in self.outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        self.assertEqual(stale, [], "run: python3 scripts/songpa_apt_prices.py render")
        on_disk = {p.name for p in sap.PAGES.glob("*.html")}
        self.assertEqual(on_disk, {p.name for p in self.outputs if p.parent == sap.PAGES})

    def test_every_page_is_linked_from_hub_and_listed_once_in_sitemap(self):
        hub = self.outputs[sap.HUB]
        sitemap = self.outputs[sap.SITEMAP]
        pages = [p for p in self.outputs if p.parent == sap.PAGES]
        self.assertGreater(len(pages), 0)
        for page in pages:
            self.assertIn(f'href="apartments/{page.name}"', hub)
            self.assertEqual(sitemap.count(f"<loc>{sap.SITE}/apartments/{page.name}</loc>"), 1)
        self.assertEqual(sitemap.count(f"<loc>{sap.SITE}/{sap.HUB_NAME}</loc>"), 1)

    def test_pages_are_self_canonical_tracked_and_link_back(self):
        for page in (p for p in self.outputs if p.parent == sap.PAGES):
            html = self.outputs[page]
            self.assertIn(f'<link rel="canonical" href="{sap.SITE}/apartments/{page.name}">', html)
            self.assertIn('src="../js/privacyAnalytics.js"', html)
            self.assertIn(f'href="../{sap.HUB_NAME}"', html)
            self.assertNotIn("noindex", html)
            for match in re.findall(r'href="([a-z0-9-]+\.html)"', html):
                self.assertTrue((sap.PAGES / match).exists() or match in {p.name for p in self.outputs}, match)

    def test_data_keeps_only_published_trade_fields(self):
        for slot in self.data["complexes"].values():
            for row in slot["trades"]:
                self.assertEqual(len(row), 5)
                self.assertIn(row[4], ("중개", "직거래"))
            for row in slot.get("rents", []):
                self.assertEqual(len(row), 6)
                self.assertIn(row[5], ("신규", "갱신", ""))


if __name__ == "__main__":
    unittest.main()
