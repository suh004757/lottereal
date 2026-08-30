import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_HTML = tuple(
    path for path in ROOT.glob("*.html")
    if not path.name.startswith("naver")
)


class HomeUrlNormalizationTest(unittest.TestCase):
    def test_public_pages_link_to_canonical_root_instead_of_index_html(self):
        offenders = {}
        pattern = re.compile(r'href=["\'](?:\./)?index\.html(?=[#"\'])', re.IGNORECASE)
        for path in PUBLIC_HTML:
            matches = pattern.findall(path.read_text(encoding="utf-8", errors="ignore"))
            if matches:
                offenders[path.name] = len(matches)
        self.assertEqual({}, offenders)


if __name__ == "__main__":
    unittest.main()
