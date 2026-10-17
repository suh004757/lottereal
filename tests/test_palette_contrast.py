"""Brand palette tokens must keep WCAG AA text contrast.

Full rendered-page coverage lives in scripts/contrast_audit.mjs (needs Chrome);
this test pins the shared tokens so a palette edit cannot silently regress.
"""
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STYLE = (ROOT / "public" / "style.css").read_text(encoding="utf-8")
LIGHT_SURFACES = ["#ffffff", "#FAFAF8", "#f5f3ef", "#fff7ed", "#f8fafc"]
HERO_SKY = ["#1b4478", "#23558f", "#2c6aa8"]


def token(name):
    match = re.search(rf"--{name}:\s*(#[0-9a-fA-F]{{6}})", STYLE)
    assert match, name
    return match.group(1)


def luminance(value):
    def channel(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = value[1:3], value[3:5], value[5:7]
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def ratio(fg, bg):
    hi, lo = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


class PaletteContrastTests(unittest.TestCase):
    def test_body_and_label_tokens_pass_aa_on_every_light_surface(self):
        for name in ("lr-muted", "lr-accent-text", "lr-text-secondary"):
            for surface in LIGHT_SURFACES:
                self.assertGreaterEqual(ratio(token(name), surface), 4.5, (name, surface))

    def test_primary_buttons_are_navy_ink_on_lotte_yellow(self):
        self.assertGreaterEqual(ratio(token("lr-ink-on-yellow"), token("lr-yellow")), 7)
        self.assertGreaterEqual(ratio(token("lr-ink-on-yellow"), token("lr-yellow-strong")), 7)
        block = STYLE[STYLE.index(".lr-btn--primary {"):]
        block = block[:block.index("}")]
        self.assertIn("var(--lr-yellow)", block)
        self.assertIn("var(--lr-ink-on-yellow)", block)

    def test_hero_sky_keeps_white_and_yellow_text_readable(self):
        for sky in HERO_SKY:
            self.assertGreaterEqual(ratio("#ffffff", sky), 4.5, sky)
            self.assertGreaterEqual(ratio(token("lr-yellow-text"), sky), 3, sky)
        motion = (ROOT / "public" / "css" / "home-motion.css").read_text(encoding="utf-8")
        for sky in HERO_SKY:
            self.assertIn(sky, motion)
        self.assertNotIn("#0b1626", motion)

    def test_international_checklist_headings_are_light_on_the_ink_band(self):
        intl = (ROOT / "public" / "css" / "international.css").read_text(encoding="utf-8")
        rule = intl[intl.index(".intl-steps strong {"):]
        self.assertIn("color: #f7f3e9;", rule[:rule.index("}")])
        self.assertGreaterEqual(ratio("#f7f3e9", "#153b2d"), 4.5)
        self.assertGreaterEqual(ratio("#7a5c22", "#f7f3e9"), 4.5)

    def test_fee_calculator_shares_the_dusk_sky_and_yellow_accent(self):
        fee = (ROOT / "public" / "css" / "brokerage-fee-calculator.css").read_text(encoding="utf-8")
        hero = fee[fee.index(".fee-hero {"):]
        hero = hero[:hero.index("}")]
        self.assertIn("rgba(27, 68, 120", hero)
        self.assertIn("#23558f", hero)
        self.assertNotIn("rgba(9, 27, 45", fee)
        self.assertNotIn("#102031", fee)
        page = (ROOT / "public" / "brokerage-fee-calculator.html").read_text(encoding="utf-8")
        self.assertNotIn("<em>", page.split("<h1>", 1)[1].split("</h1>", 1)[0])


if __name__ == "__main__":
    unittest.main()
