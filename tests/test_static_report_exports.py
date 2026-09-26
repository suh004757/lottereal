import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "export_static_reports.mjs"


class StaticReportExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.input_path = self.base / "reports.json"
        self.output_dir = self.base / "reports"
        self.sitemap = self.base / "Sitemap.xml"
        self.sitemap.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            '  <url><loc>https://lottes.co.kr/</loc></url>\n'
            '</urlset>\n',
            encoding="utf-8",
        )
        self.report = {
            "slug": "2026-09-26-songpa-safe-check",
            "title": "송파 전월세 계약 전 확인할 내용",
            "summary": "송파 전월세 계약 전에 확인할 서류와 상담 준비사항을 쉽게 정리했습니다.",
            "report_md": (
                "# 송파 전월세 계약 전 확인할 내용\n\n"
                "## 먼저 볼 내용\n\n계약 전 **등기부**를 확인합니다.\n\n"
                "## 상담 전에 확인할 점\n\n- 입주 시기\n- 예산\n\n"
                "[공식 자료](https://www.gov.kr/)\n\n"
                "[관련 글](report.html?slug=2026-09-25-related-check)\n\n"
                "[절대주소 관련 글](https://lottes.co.kr/report.html?slug=2026-09-24-absolute-check)\n\n"
                "[위험 링크](javascript:alert(1))"
            ),
            "evidence_json": [
                {"name": "정부24", "url": "https://www.gov.kr/", "checkedAt": "2026-09-26"},
                {"name": "잘못된 링크", "url": "javascript:alert(1)", "checkedAt": "2026-09-26"},
            ],
            "created_at": "2026-09-26T03:00:00+00:00",
            "updated_at": "2026-09-26T04:00:00+00:00",
            "metadata": {"content_type": "legal_checklist"},
            "status": "published",
        }

    def run_export(self, reports):
        self.input_path.write_text(json.dumps(reports, ensure_ascii=False), encoding="utf-8")
        return subprocess.run(
            [
                "node",
                str(SCRIPT),
                "--input",
                str(self.input_path),
                "--output-dir",
                str(self.output_dir),
                "--sitemap",
                str(self.sitemap),
                "--site-url",
                "https://lottes.co.kr",
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def test_exports_indexable_static_page_and_sitemap_url(self):
        result = self.run_export([self.report])
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.output_dir / f"{self.report['slug']}.html"
        self.assertTrue(output.exists())
        html = output.read_text(encoding="utf-8")
        canonical = f"https://lottes.co.kr/reports/{self.report['slug']}.html"
        self.assertIn(f'<link rel="canonical" href="{canonical}">', html)
        self.assertIn(self.report["title"], html)
        self.assertIn(self.report["summary"], html)
        self.assertIn("<h2>먼저 볼 내용</h2>", html)
        self.assertEqual(html.count("<h1>"), 1)
        self.assertIn("<strong>등기부</strong>", html)
        self.assertIn("입주 시기", html)
        self.assertIn('href="2026-09-25-related-check.html"', html)
        self.assertIn('href="2026-09-24-absolute-check.html"', html)
        self.assertIn("../js/privacyAnalytics.js", html)
        self.assertIn('data-report-slug="2026-09-26-songpa-safe-check"', html)
        self.assertIn('../js/staticReportPage.mjs', html)
        self.assertNotIn("javascript:alert", html)
        sitemap = self.sitemap.read_text(encoding="utf-8")
        self.assertIn(f"<loc>{canonical}</loc>", sitemap)
        self.assertNotIn(f"report.html?slug={self.report['slug']}", sitemap)

    def test_rejects_unsafe_slug_without_writing_outside_output(self):
        report = dict(self.report, slug="../escape")
        result = self.run_export([report])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / "escape.html").exists())


if __name__ == "__main__":
    unittest.main()
