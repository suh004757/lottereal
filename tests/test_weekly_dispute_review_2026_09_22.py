import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-08-25-rental-renewal-landlord-actual-residence-proof.json"
TODAY_SLUG = "2026-09-22-songpa-lease-renewal-difference"


class WeeklyDisputeReviewSeptemberTwentyTwoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_preserves_historical_identity_and_publication_date(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-08-25-rental-renewal-landlord-actual-residence-proof")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-08-25T02:27:41.443241+00:00")
        self.assertEqual(report["metadata"]["as_of"], "2026-09-15")

    def test_adds_current_renewal_guide_without_new_dispute_url(self):
        copy = self.report["report_md"]
        self.assertIn(f"reports/{TODAY_SLUG}.html", copy)
        self.assertIn("묵시적 갱신과 계약갱신요구권의 차이", copy)
        self.assertEqual(self.report["metadata"]["last_reviewed"], "2026-09-22")
        self.assertIn("내부 링크", self.report["metadata"]["revision"])

    def test_updated_copy_still_passes_public_validator(self):
        self.assertEqual(validate_report_copy(self.report), [])


if __name__ == "__main__":
    unittest.main()
