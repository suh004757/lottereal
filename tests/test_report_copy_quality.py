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

    def test_dispute_case_requires_practical_sections_official_legal_source_and_disclaimer(self):
        report = {
            "title": "전월세집 곰팡이, 집주인이 고쳐야 하나요",
            "summary": "곰팡이 원인과 수선 책임이 갈리는 기준을 실제 판례와 공식 법령으로 정리했습니다.",
            "report_md": """# 전월세집 곰팡이

## 먼저 볼 내용
원인부터 확인합니다.
## 확인된 흐름
구조적 하자인지 살펴봅니다.
## 송파·잠실에서 볼 점
반지하와 외벽 상태를 확인합니다.
## 법에서 확인할 부분
민법상 수선의무를 봅니다.
## 임대인·임차인이 각각 준비할 증거
사진과 통지 기록을 준비합니다.
## 대응 순서
원인을 확인하고 서면으로 통지합니다.
## 결론이 달라지는 예외
환기 부족이면 판단이 달라집니다.
## 상담 전에 확인할 점
계약서와 견적을 준비합니다.
## 자료와 한계
이 글은 일반 정보이며 개별 사건에 대한 법률 자문이 아닙니다.
""",
            "evidence_json": [
                {"name": "국가법령정보센터 민법", "url": "https://www.law.go.kr/법령/민법", "caseNo": "민법 제623조", "checkedAt": "2026-08-25"},
                {"name": "국가법령정보센터 판례", "url": "https://www.law.go.kr/판례/손해배상/(2010다89876)", "caseNo": "대법원 2010다89876", "checkedAt": "2026-08-25"},
            ],
            "metadata": {"content_type": "dispute_case"},
        }
        self.assertEqual(validate_report_copy(report), [])

        bad = {**report, "report_md": report["report_md"].replace("## 대응 순서", "## 참고")}
        errors = "\n".join(validate_report_copy(bad))
        self.assertIn("dispute section missing", errors)


if __name__ == "__main__":
    unittest.main()
