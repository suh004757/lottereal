import html
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "index.html"
EXPECTED_TITLE = "송파·강남 부동산 매물·계약 상담 | 롯데부동산"
EXPECTED_DESCRIPTION = (
    "송파·강남의 아파트·빌라·사무실·상가 매물을 확인하고, "
    "전화·방문·계약 상담 전에 잠실·삼전동·석촌동에서 필요한 내용을 정리해 드립니다."
)


def attr(content, pattern):
    matches = re.findall(pattern, content, re.IGNORECASE)
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one metadata match, found {len(matches)}: {pattern}")
    return html.unescape(matches[0]).strip()


class HomepageSearchSnippetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = HOME.read_text(encoding="utf-8")

    def test_search_title_and_description_state_local_service_and_next_action(self):
        title = attr(self.content, r"<title>([^<]+)</title>")
        description = attr(
            self.content,
            r'<meta\s+name="description"\s+content="([^"]+)">',
        )
        self.assertEqual(EXPECTED_TITLE, title)
        self.assertEqual(EXPECTED_DESCRIPTION, description)
        self.assertLessEqual(len(title), 60)
        self.assertLessEqual(len(description), 160)

    def test_social_metadata_matches_search_snippet(self):
        og_title = attr(
            self.content,
            r'<meta\s+property="og:title"\s+content="([^"]+)">',
        )
        twitter_title = attr(
            self.content,
            r'<meta\s+name="twitter:title"\s+content="([^"]+)">',
        )
        og_description = attr(
            self.content,
            r'<meta\s+property="og:description"\s+content="([^"]+)">',
        )
        twitter_description = attr(
            self.content,
            r'<meta\s+name="twitter:description"\s+content="([^"]+)">',
        )
        self.assertEqual(EXPECTED_TITLE, og_title)
        self.assertEqual(EXPECTED_TITLE, twitter_title)
        self.assertEqual(EXPECTED_DESCRIPTION, og_description)
        self.assertEqual(EXPECTED_DESCRIPTION, twitter_description)
        self.assertNotRegex(self.content, r'<meta\s+name="og:')
        self.assertNotRegex(self.content, r'<meta\s+property="twitter:')

    def test_metadata_contract_rejects_duplicate_tags(self):
        duplicate_title = self.content + f"<title>{EXPECTED_TITLE}</title>"
        duplicate_description = (
            self.content
            + f'<meta name="description" content="{EXPECTED_DESCRIPTION}">'
        )
        with self.assertRaisesRegex(AssertionError, "exactly one metadata match"):
            attr(duplicate_title, r"<title>([^<]+)</title>")
        with self.assertRaisesRegex(AssertionError, "exactly one metadata match"):
            attr(
                duplicate_description,
                r'<meta\s+name="description"\s+content="([^"]+)">',
            )

    def test_canonical_root_and_local_hreflang_are_unchanged(self):
        self.assertIn('<link rel="canonical" href="https://lottes.co.kr/">', self.content)
        self.assertIn('<link rel="alternate" hreflang="ko-KR" href="https://lottes.co.kr/">', self.content)


if __name__ == "__main__":
    unittest.main()
