import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-08-25-rental-deposit-lease-registration-before-moving.json"


class WeeklyDisputeReviewSeptemberTwentyNineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_preserves_stable_url_and_original_publication_identity(self):
        report = self.report
        self.assertEqual(report["slug"], "2026-08-25-rental-deposit-lease-registration-before-moving")
        self.assertEqual(report["metadata"]["as_of"], "2026-08-25")
        self.assertEqual(report["metadata"]["first_published_at"], "2026-08-24T15:32:16.598266+00:00")
        self.assertIn("수정됨: 2026년 9월 29일", report["report_md"])

    def test_adds_verified_cost_claim_and_evidence_preparation(self):
        report = self.report
        copy = report["report_md"]
        self.assertIn("대법원 2025년 4월 24일 선고 2024다221455", copy)
        self.assertIn("상계하는 방법", copy)
        self.assertIn("비용의 영수증·납부내역", copy)
        self.assertIn("변호사비용은 같은 항목이 아닙니다", copy)
        self.assertEqual(report["metadata"]["last_reviewed"], "2026-09-29")
        self.assertTrue(any(source.get("caseNo") == "대법원 2025. 4. 24. 선고 2024다221455" for source in report["evidence_json"]))

    def test_updated_copy_still_passes_public_validator(self):
        self.assertEqual(validate_report_copy(self.report), [])


if __name__ == "__main__":
    unittest.main()
