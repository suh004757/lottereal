import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


class VisitGuidanceCopyTests(unittest.TestCase):
    def test_report_cta_does_not_promise_unpublished_business_hours(self):
        report = (REPO / "report.html").read_text(encoding="utf-8")
        contact = (REPO / "contact.html").read_text(encoding="utf-8")

        self.assertNotIn(">위치·영업시간 확인</a>", report)
        self.assertIn('href="contact.html">위치·방문 안내</a>', report)
        self.assertIn(
            'href="contact.html#inquiry-options">전화가 어려우면 문의 남기기</a>',
            report,
        )
        self.assertIn("방문 전 연락 주시면 편히 안내해드립니다", contact)


if __name__ == "__main__":
    unittest.main()
