import json
import re
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
import songpa_apt_prices as apt  # noqa: E402
import songpa_villa_prices as villa  # noqa: E402

RENT_XML = """<?xml version="1.0" encoding="utf-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>
<item><buildYear>2019</buildYear><contractType>신규</contractType><dealDay>3</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>1,000</deposit><excluUseAr>24.5</excluUseAr><floor>3</floor><houseType>다세대</houseType><jibun>12-3</jibun><mhouseNm>테스트빌라</mhouseNm><monthlyRent>75</monthlyRent><preDeposit>1,000</preDeposit><useRRRight> </useRRRight><umdNm>삼전동</umdNm></item>
<item><buildYear>2003</buildYear><contractType>갱신</contractType><dealDay>9</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>25,000</deposit><excluUseAr>41.2</excluUseAr><floor>2</floor><houseType>다세대</houseType><jibun>45</jibun><mhouseNm>다른빌라</mhouseNm><monthlyRent>0</monthlyRent><umdNm>삼전동</umdNm></item>
<item><buildYear>2010</buildYear><contractType>신규</contractType><dealDay>1</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><deposit>20,000</deposit><excluUseAr>40</excluUseAr><floor>1</floor><houseType>다세대</houseType><mhouseNm>석촌빌라</mhouseNm><monthlyRent>0</monthlyRent><umdNm>석촌동</umdNm></item>
</items><totalCount>3</totalCount></body></response>""".encode("utf-8")


def rent(day, area, deposit, monthly, kind="신규", built=2018):
    return [f"2026-09-{day:02d}", area, 2, deposit, monthly, kind, built]


class ParseAndCollectTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(villa.CONFIG.read_text(encoding="utf-8"))

    def test_collect_keeps_configured_areas_and_drops_names_and_lots(self):
        rents, total = villa.parse_rent_xml(RENT_XML)
        self.assertEqual(total, 3)
        areas = villa.collect(rents, [], self.config, {})
        rows = areas["samjeon"]["rents"]
        self.assertEqual(rows, [["2026-09-09", 41.2, 2, 25000, 0, "갱신", 2003], ["2026-09-03", 24.5, 3, 1000, 75, "신규", 2019]])
        text = json.dumps(areas, ensure_ascii=False)
        for private in ("테스트빌라", "다른빌라", "12-3", "석촌빌라"):
            self.assertNotIn(private, text)

    def test_missing_trade_api_keeps_previous_trades(self):
        previous = {"samjeon": {"trades": [["2026-08-01", 40.0, 2, 30000, 2010, "중개"]]}}
        areas = villa.collect([], None, self.config, previous)
        self.assertEqual(areas["samjeon"]["trades"], previous["samjeon"]["trades"])
        self.assertEqual(villa.collect([], [], self.config, previous)["samjeon"]["trades"], [])

    def test_config_slugs_are_safe_and_unique(self):
        slugs = [a["slug"] for a in self.config["areas"]]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertEqual(len({a["umd"] for a in self.config["areas"]}), len(slugs))
        for slug in slugs:
            self.assertRegex(slug, apt.SAFE_SLUG)


class SummaryTest(unittest.TestCase):
    def test_bands_cover_every_area(self):
        for area in (0, 12.3, 29.99, 30, 49.9, 50, 69.99, 70, 300):
            self.assertIsInstance(villa.area_band(area), int)
        self.assertEqual([villa.area_band(a) for a in (29.99, 30, 70)], [0, 1, 3])
        self.assertEqual([villa.age_band(y, 2026) for y in (2026, 2016, 2015, 2006, 2005)], [0, 0, 1, 1, 2])
        self.assertIsNone(villa.age_band(0, 2026))
        self.assertEqual((villa.floor_label(-1), villa.floor_label(3)), ("지하 1층", "3층"))

    def test_medians_need_minimum_contracts(self):
        two = [rent(1, 40, 20000, 0), rent(2, 40, 22000, 0)]
        self.assertEqual(villa.jeonse_median(two), (None, ""))
        self.assertEqual(villa.wolse_median([rent(1, 25, 1000, 70)]), (None, None))
        three = two + [rent(3, 40, 30000, 0, "갱신")]
        self.assertEqual(villa.jeonse_median(three), (22000, "전체"))
        fresh = three + [rent(4, 40, 26000, 0)]
        self.assertEqual(villa.jeonse_median(fresh), (22000, "신규"))

    def test_summary_counts_and_cells(self):
        rows = [rent(i, 25, 1000, 70 + i, built=2020) for i in range(1, 6)] + [rent(9, 41, 25000, 0, built=2000)]
        summary = villa.summarize({"rents": rows, "trades": []}, ["202609"], 2026)
        self.assertEqual((summary["count"], summary["wolse"], summary["jeonse"]), (6, 5, 1))
        small = summary["bands"][0]
        self.assertEqual((small["wolse_deposit"], small["wolse_monthly"]), (1000, 73))
        self.assertEqual(small["wolse_cells"][0], (1000, 73))
        self.assertEqual(small["wolse_cells"][2], (None, None))
        self.assertIsNone(summary["bands"][1]["jeonse"])
        self.assertEqual(summary["top"]["label"], small["label"])


class SitemapTest(unittest.TestCase):
    BASE = "<?xml version=\"1.0\"?>\n<urlset>\n  <url>\n    <loc>https://lottes.co.kr/</loc>\n  </url>\n</urlset>\n"

    def test_generators_keep_each_others_entries_in_place(self):
        apts = [(f"{apt.SITE}/{apt.HUB_NAME}", "2026-10-01")]
        villas = [(f"{apt.SITE}/villas/samjeon.html", "2026-10-02")]
        once = villa.apt.update_sitemap(apt.update_sitemap(self.BASE, apts), villas, villa.SITEMAP_PATTERN)
        again = villa.apt.update_sitemap(apt.update_sitemap(once, apts), villas, villa.SITEMAP_PATTERN)
        self.assertEqual(again, once)
        self.assertLess(once.index(apt.HUB_NAME), once.index("villas/samjeon.html"))
        self.assertEqual(once.count("<loc>"), 3)


class GeneratedSiteTest(unittest.TestCase):
    """The committed pages are exactly what the committed data renders to."""

    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(villa.CONFIG.read_text(encoding="utf-8"))
        cls.data = json.loads(villa.DATA.read_text(encoding="utf-8"))
        cls.outputs = villa.build_site(cls.data, cls.config)

    def test_committed_files_match_the_renderer(self):
        stale = [str(p.relative_to(REPO)) for p, text in self.outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        self.assertEqual(stale, [], "run: python3 scripts/songpa_villa_prices.py render")
        self.assertEqual({p.name for p in villa.PAGES.glob("*.html")}, {p.name for p in self.outputs if p.parent == villa.PAGES})

    def test_pages_are_listed_canonical_tracked_and_linked(self):
        pages = [p for p in self.outputs if p.parent == villa.PAGES]
        self.assertGreater(len(pages), 0)
        hub = self.outputs[villa.HUB]
        sitemap = self.outputs[villa.SITEMAP]
        self.assertEqual(sitemap.count(f"<loc>{apt.SITE}/{villa.HUB_NAME}</loc>"), 1)
        self.assertIn(f'href="{villa.HUB_NAME}"', (apt.PUBLIC / apt.HUB_NAME).read_text(encoding="utf-8"))
        for page in pages:
            html = self.outputs[page]
            self.assertEqual(sitemap.count(f"<loc>{apt.SITE}/villas/{page.name}</loc>"), 1)
            self.assertIn(f'<link rel="canonical" href="{apt.SITE}/villas/{page.name}">', html)
            self.assertIn('src="../js/privacyAnalytics.js"', html)
            self.assertIn(f'href="../{villa.HUB_NAME}"', html)
            self.assertNotIn("noindex", html)
            self.assertIn(f'href="villas/{page.name}"', hub)
            for target in re.findall(r'href="\.\./([a-z0-9-]+\.html)', html):
                self.assertTrue((apt.PUBLIC / target).exists() or apt.PUBLIC / target in self.outputs, target)
            for sibling in re.findall(r'<li><a href="([a-z0-9-]+\.html)"', html):
                self.assertIn(villa.PAGES / sibling, self.outputs)

    def test_data_keeps_only_aggregatable_fields(self):
        for slot in self.data["areas"].values():
            for row in slot["rents"]:
                self.assertEqual(len(row), 7)
                self.assertIn(row[5], ("신규", "갱신", ""))
            for row in slot["trades"]:
                self.assertEqual(len(row), 6)
                self.assertIn(row[5], ("중개", "직거래"))


if __name__ == "__main__":
    unittest.main()
