import json
import unittest
from pathlib import Path

from scripts.lottereal_supabase import validate_report_copy


ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "content" / "daily" / "2026-08-25-rental-renewal-landlord-actual-residence-proof.json"
SLUG = "2026-08-25-rental-renewal-landlord-actual-residence-proof"
CASE_NO = "대법원 2026. 9. 10. 선고 2026다203203"


class WeeklyDisputeReviewOctoberTwentyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(PAYLOAD.read_text(encoding="utf-8"))

    def test_updates_existing_url_without_changing_publication_identity(self):
        metadata = self.report["metadata"]
        self.assertEqual(self.report["slug"], SLUG)
        self.assertEqual(metadata["first_published_at"], "2026-08-25T02:27:41.443241+00:00")
        self.assertEqual(metadata["as_of"], "2026-10-20")
        self.assertEqual(metadata["last_reviewed"], "2026-10-20")

    def test_adds_verified_supreme_court_ruling_and_practical_sections(self):
        copy = self.report["report_md"]
        for marker in (
            "## 송파·잠실에서 볼 점",
            "## 법에서 확인할 부분",
            "## 임대인·임차인이 각각 준비할 증거",
            "## 대응 순서",
            "## 결론이 달라지는 예외",
            "예측하기 어려운 사정",
            "제3자 임대가 필요했던 이유",
            "개별 사건에 대한 법률 자문이 아닙니다",
        ):
            self.assertIn(marker, copy)
        self.assertEqual(self.report["metadata"]["primary_case"], CASE_NO)
        matching = [source for source in self.report["evidence_json"] if source.get("caseNo") == CASE_NO]
        self.assertEqual(len(matching), 2)
        self.assertTrue(all(source.get("checkedAt") == "2026-10-20" for source in matching))

    def test_updated_copy_passes_public_validator(self):
        self.assertEqual(validate_report_copy(self.report), [])


if __name__ == "__main__":
    unittest.main()
