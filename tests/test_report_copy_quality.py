import unittest

from scripts.lottereal_supabase import validate_report_copy


class ReportCopyQualityTest(unittest.TestCase):
    def test_accepts_consistent_human_readable_report(self):
        report = {
            "title": "2026년 8월 송파 부동산 시장 정리",
            "summary": "공식 통계와 실제 상담 전에 확인할 항목을 쉬운 말로 정리했습니다.",
            "report_md": """# 2026년 8월 송파 부동산 시장 정리

> 기준일: 2026년 8월 24일

## 먼저 볼 내용

가격보다 거래량을 먼저 확인할 시기입니다.

## 확인된 흐름

공식 통계에서 확인되는 범위만 적었습니다.

## 송파·잠실에서 볼 점

단지와 면적에 따라 흐름이 다릅니다.

## 상담 전에 확인할 점

예산과 입주 시기를 함께 정리해 두는 편이 좋습니다.

## 자료와 한계

공개 통계는 신고와 집계에 시차가 있습니다.
""",
            "evidence_json": [
                {"name": "한국부동산원", "url": "https://www.reb.or.kr"},
                {"name": "국토교통부", "url": "https://www.molit.go.kr"},
            ],
        }
        self.assertEqual(validate_report_copy(report), [])

    def test_flags_ai_style_missing_sections_and_weak_sources(self):
        report = {
            "title": "시장 교차점과 삼각 구도",
            "summary": "짧음",
            "report_md": """# 시장 리포트 🚀

## Executive Summary

핵심 변수입니다.

## 결론 및 전략적 시사점

포지션별 행동 지침을 제안합니다.
""",
            "evidence_json": [],
        }
        errors = validate_report_copy(report)
        joined = "\n".join(errors)
        self.assertIn("required section", joined)
        self.assertIn("at least two sources", joined)
        self.assertIn("AI-style phrase", joined)
        self.assertIn("emoji", joined)


if __name__ == "__main__":
    unittest.main()
