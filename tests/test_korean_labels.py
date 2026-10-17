import re
import unittest
from pathlib import Path


PUBLIC = Path(__file__).resolve().parents[1] / "public"
FOREIGN = {"EN.html", "JP.html"}
EYEBROW = re.compile(r'class="(?:lr-kicker|hq-eyebrow|hq-index)[^"]*">([^<]+)<')


class KoreanLabelTests(unittest.TestCase):
    """Korean pages label sections in Korean; tracked English caps read as template chrome."""

    def test_korean_pages_have_no_english_caps_eyebrows(self):
        offenders = []
        for page in sorted(PUBLIC.glob("*.html")):
            name = page.name
            if name in FOREIGN or name.endswith(("_EN.html", "-en.html")):
                continue
            for label in EYEBROW.findall(page.read_text(encoding="utf-8")):
                if re.fullmatch(r"[A-Z0-9 ·/&+.,-]{4,}", label.strip()):
                    offenders.append(f"{name}: {label.strip()}")
        self.assertEqual(offenders, [])

    def test_hero_headlines_do_not_accent_a_single_phrase(self):
        for name in ("index.html", "brokerage-fee-calculator.html", "corporate-buildings.html",
                     "songpa-neighborhood-guide.html", "songpa-samgong-building.html"):
            html = (PUBLIC / name).read_text(encoding="utf-8")
            h1 = html.split("<h1", 1)[1].split("</h1>", 1)[0]
            self.assertNotIn("<em>", h1, name)


if __name__ == "__main__":
    unittest.main()
