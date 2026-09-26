import json
import os
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
        self.report_page = self.base / "report.html"
        self.lock_path = self.base / ".report.html.publish.lock"
        self.mutex_path = self.base / ".report.html.publish.mutex"
        self.report_page.write_text(
            '<html><body>\n'
            '<!-- STATIC_REPORT_ARCHIVE_START -->\n'
            '<div id="report-archive-all-static">stale archive</div>\n'
            '<!-- STATIC_REPORT_ARCHIVE_END -->\n'
            '</body></html>\n',
            encoding="utf-8",
        )
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

    def run_export(self, reports, env=None, allow_shrink=False):
        self.input_path.write_text(json.dumps(reports, ensure_ascii=False), encoding="utf-8")
        process_env = os.environ.copy()
        process_env.update(env or {})
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
                "--report-page",
                str(self.report_page),
                "--site-url",
                "https://lottes.co.kr",
            ] + (["--allow-shrink"] if allow_shrink else []),
            cwd=ROOT,
            env=process_env,
            text=True,
            capture_output=True,
        )

    def export_command(self, allow_shrink=False):
        return [
            "node", str(SCRIPT), "--input", str(self.input_path),
            "--output-dir", str(self.output_dir), "--sitemap", str(self.sitemap),
            "--report-page", str(self.report_page), "--site-url", "https://lottes.co.kr",
        ] + (["--allow-shrink"] if allow_shrink else [])

    @staticmethod
    def process_start(pid):
        stat = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
        return stat[stat.rfind(")") + 2:].split()[19]

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
        self.assertIn("© 2026 롯데부동산", html)
        self.assertNotIn("javascript:alert", html)
        sitemap = self.sitemap.read_text(encoding="utf-8")
        self.assertIn(f"<loc>{canonical}</loc>", sitemap)
        self.assertIn("<lastmod>2026-09-26</lastmod>", sitemap)
        self.assertNotIn(f"report.html?slug={self.report['slug']}", sitemap)

    def test_regenerates_complete_server_rendered_archive_in_publication_order(self):
        older = dict(
            self.report,
            slug="2026-09-25-older-report",
            title="이전 리포트 <script>alert(1)</script>",
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        result = self.run_export([older, self.report])

        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.report_page.read_text(encoding="utf-8")
        self.assertIn("전체 리포트 (2건)", archive)
        for report in (self.report, older):
            href = f'reports/{report["slug"]}.html'
            self.assertEqual(archive.count(href), 1)
        self.assertLess(archive.index(self.report["title"]), archive.index("이전 리포트"))
        self.assertIn("이전 리포트 &lt;script&gt;alert(1)&lt;/script&gt;", archive)
        self.assertNotIn("<script>alert(1)</script>", archive)

    def test_orders_archive_by_parsed_instant_then_slug(self):
        same_instant_z_slug = dict(
            self.report,
            slug="a-same-instant",
            title="같은 시각 A",
            created_at="2026-09-26T05:30:00Z",
            updated_at="2026-09-26T05:30:00Z",
        )
        later_by_offset = dict(
            self.report,
            slug="z-same-instant",
            title="같은 시각 Z",
            created_at="2026-09-26T00:30:00-05:00",
            updated_at="2026-09-26T00:30:00-05:00",
        )
        earlier_lexically_larger = dict(
            self.report,
            slug="middle-earlier-instant",
            title="실제로 더 이른 시각",
            created_at="2026-09-26T04:00:00+00:00",
            updated_at="2026-09-26T04:00:00+00:00",
        )

        result = self.run_export([
            earlier_lexically_larger,
            later_by_offset,
            same_instant_z_slug,
        ])

        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.report_page.read_text(encoding="utf-8")
        positions = [
            archive.index(same_instant_z_slug["title"]),
            archive.index(later_by_offset["title"]),
            archive.index(earlier_lexically_larger["title"]),
        ]
        self.assertEqual(positions, sorted(positions))

    def test_preserves_public_modified_date_when_only_cms_timestamp_changes(self):
        original = dict(
            self.report,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        touched_only = dict(original, updated_at="2026-09-26T04:00:00+00:00")
        second = self.run_export([touched_only])
        self.assertEqual(second.returncode, 0, second.stderr)

        html = (self.output_dir / f"{original['slug']}.html").read_text(encoding="utf-8")
        self.assertIn('"dateModified":"2026-09-25"', html)
        self.assertIn("수정 2026-09-25", html)
        sitemap = self.sitemap.read_text(encoding="utf-8")
        self.assertIn("<lastmod>2026-09-25</lastmod>", sitemap)
        self.assertNotIn("<lastmod>2026-09-26</lastmod>", sitemap)

    def test_migrates_legacy_page_without_hash_without_advancing_modified_date(self):
        original = dict(
            self.report,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        output = self.output_dir / f"{original['slug']}.html"
        legacy_html = output.read_text(encoding="utf-8")
        hash_line = next(
            line for line in legacy_html.splitlines(keepends=True)
            if 'meta name="lottereal:content-hash"' in line
        )
        output.write_text(legacy_html.replace(hash_line, "", 1), encoding="utf-8")

        touched_only = dict(original, updated_at="2026-09-26T04:00:00+00:00")
        second = self.run_export([touched_only])
        self.assertEqual(second.returncode, 0, second.stderr)

        migrated = output.read_text(encoding="utf-8")
        self.assertEqual(migrated.count('meta name="lottereal:content-hash"'), 1)
        self.assertIn('"dateModified":"2026-09-25"', migrated)
        self.assertIn("<lastmod>2026-09-25</lastmod>", self.sitemap.read_text(encoding="utf-8"))

    def test_ignores_non_rendered_evidence_metadata_for_modified_date(self):
        evidence = [dict(self.report["evidence_json"][0], coverage="처음 내부 설명")]
        original = dict(
            self.report,
            evidence_json=evidence,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        touched_only = dict(
            original,
            evidence_json=[dict(evidence[0], coverage="바뀐 내부 설명")],
            updated_at="2026-09-26T04:00:00+00:00",
        )
        second = self.run_export([touched_only])
        self.assertEqual(second.returncode, 0, second.stderr)

        html = (self.output_dir / f"{original['slug']}.html").read_text(encoding="utf-8")
        self.assertIn('"dateModified":"2026-09-25"', html)
        self.assertNotIn("<lastmod>2026-09-26</lastmod>", self.sitemap.read_text(encoding="utf-8"))

    def test_preserves_modified_date_when_markdown_source_renders_identically(self):
        original = dict(
            self.report,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        source_whitespace_only = dict(
            original,
            report_md=original["report_md"] + "\n\n",
            updated_at="2026-09-26T04:00:00+00:00",
        )
        second = self.run_export([source_whitespace_only])
        self.assertEqual(second.returncode, 0, second.stderr)

        html = (self.output_dir / f"{original['slug']}.html").read_text(encoding="utf-8")
        self.assertIn('"dateModified":"2026-09-25"', html)
        self.assertNotIn("<lastmod>2026-09-26</lastmod>", self.sitemap.read_text(encoding="utf-8"))

    def test_uses_cms_modified_date_when_public_content_changes(self):
        original = dict(
            self.report,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        changed = dict(
            original,
            summary="공개 설명이 실제로 바뀐 리포트입니다.",
            updated_at="2026-09-26T04:00:00+00:00",
        )
        second = self.run_export([changed])
        self.assertEqual(second.returncode, 0, second.stderr)

        html = (self.output_dir / f"{original['slug']}.html").read_text(encoding="utf-8")
        self.assertIn('"dateModified":"2026-09-26"', html)
        self.assertIn("수정 2026-09-26", html)
        self.assertIn(changed["summary"], html)
        self.assertIn("<lastmod>2026-09-26</lastmod>", self.sitemap.read_text(encoding="utf-8"))

    def test_created_at_correction_advances_public_modified_date(self):
        original = dict(
            self.report,
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([original])
        self.assertEqual(first.returncode, 0, first.stderr)

        corrected = dict(
            original,
            created_at="2026-09-26T03:00:00+00:00",
            updated_at="2026-09-26T04:00:00+00:00",
        )
        second = self.run_export([corrected])
        self.assertEqual(second.returncode, 0, second.stderr)

        html = (self.output_dir / f"{original['slug']}.html").read_text(encoding="utf-8")
        self.assertIn('"datePublished":"2026-09-26"', html)
        self.assertIn('"dateModified":"2026-09-26"', html)
        self.assertIn("<lastmod>2026-09-26</lastmod>", self.sitemap.read_text(encoding="utf-8"))

    def test_rejects_invalid_full_iso_timestamps_before_touching_publication(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_reports = {
            path.name: path.read_bytes() for path in self.output_dir.glob("*.html")
        }
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()
        invalid_cases = (
            ("created_at", None),
            ("created_at", "2026-09-26"),
            ("created_at", "2026-02-30T03:00:00+00:00"),
            ("updated_at", None),
            ("updated_at", "not-a-timestamp"),
            ("updated_at", "2026-09-26T24:00:00+00:00"),
        )

        for field, value in invalid_cases:
            with self.subTest(field=field, value=value):
                invalid = dict(self.report, **{field: value})
                result = self.run_export([invalid])

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"invalid {field}", result.stderr)
                self.assertIn(self.report["slug"], result.stderr)
                self.assertEqual(
                    {path.name: path.read_bytes() for path in self.output_dir.glob("*.html")},
                    original_reports,
                )
                self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
                self.assertEqual(self.report_page.read_bytes(), original_report_page)
                self.assertEqual(list(self.base.glob(".*.publish-*")), [])

    def test_rejects_updated_at_before_created_at(self):
        reversed_dates = dict(
            self.report,
            created_at="2026-09-26T04:00:00+00:00",
            updated_at="2026-09-26T03:59:59+00:00",
        )

        result = self.run_export([reversed_dates])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("updated_at precedes created_at", result.stderr)
        self.assertFalse(self.output_dir.exists())

    def test_invalid_or_prepublication_legacy_modified_date_is_not_reused(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        output = self.output_dir / f"{self.report['slug']}.html"
        original = output.read_text(encoding="utf-8")

        for legacy_date in ("2026-02-30", "2026-09-25"):
            with self.subTest(legacy_date=legacy_date):
                legacy = original.replace('"dateModified":"2026-09-26"', f'"dateModified":"{legacy_date}"')
                legacy = legacy.replace("수정 2026-09-26", f"수정 {legacy_date}")
                hash_line = next(
                    line for line in legacy.splitlines(keepends=True)
                    if 'meta name="lottereal:content-hash"' in line
                )
                output.write_text(legacy.replace(hash_line, "", 1), encoding="utf-8")
                touched = dict(self.report, updated_at="2026-09-27T04:00:00+00:00")

                result = self.run_export([touched])

                self.assertEqual(result.returncode, 0, result.stderr)
                exported = output.read_text(encoding="utf-8")
                self.assertIn('"dateModified":"2026-09-27"', exported)

    def test_rejects_missing_archive_markers_before_writing_outputs(self):
        original_sitemap = self.sitemap.read_text(encoding="utf-8")
        self.report_page.write_text("<html><body>missing markers</body></html>\n", encoding="utf-8")

        result = self.run_export([self.report])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid report archive markers", result.stderr)
        self.assertFalse((self.output_dir / f"{self.report['slug']}.html").exists())
        self.assertEqual(self.sitemap.read_text(encoding="utf-8"), original_sitemap)

    def test_existing_live_publication_mutex_blocks_outputs_byte_identically(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_reports = {
            path.name: path.read_bytes() for path in self.output_dir.glob("*.html")
        }
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()
        self.mutex_path.mkdir()
        (self.mutex_path / "owner.json").write_text(json.dumps({
            "version": 1,
            "token": "live-test-owner",
            "pid": os.getpid(),
            "processStart": self.process_start(os.getpid()),
            "createdAt": "2026-09-26T00:00:00.000Z",
        }), encoding="utf-8")

        changed = dict(
            self.report,
            summary="잠금 중에는 공개되면 안 되는 변경",
            updated_at="2026-09-27T04:00:00+00:00",
        )
        result = self.run_export([changed])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("publication mutex owner process is alive", result.stderr)
        self.assertIn(str(self.mutex_path), result.stderr)
        self.assertEqual(
            {path.name: path.read_bytes() for path in self.output_dir.glob("*.html")},
            original_reports,
        )
        self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
        self.assertEqual(self.report_page.read_bytes(), original_report_page)
        self.assertTrue(self.mutex_path.is_dir())
        self.assertFalse(self.lock_path.exists())

    def test_successful_publication_releases_mutex_and_transaction_root(self):
        result = self.run_export([self.report])

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.lock_path.exists())
        self.assertFalse(self.mutex_path.exists())

    def test_live_mutex_with_unknown_process_start_is_not_reclaimed(self):
        self.mutex_path.mkdir()
        (self.mutex_path / "owner.json").write_text(json.dumps({
            "version": 1,
            "token": "live-owner-with-unknown-start",
            "pid": os.getpid(),
            "processStart": None,
            "createdAt": "2026-09-26T00:00:00.000Z",
        }), encoding="utf-8")

        result = self.run_export([self.report])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("publication mutex owner process is alive", result.stderr)
        self.assertTrue(self.mutex_path.exists())
        self.assertFalse(self.lock_path.exists())

    def test_pid_reuse_identity_mismatch_is_reclaimed(self):
        self.mutex_path.mkdir()
        (self.mutex_path / "owner.json").write_text(json.dumps({
            "version": 1,
            "token": "reused-pid-owner",
            "pid": os.getpid(),
            "processStart": "definitely-not-this-process-start",
            "createdAt": "2026-09-26T00:00:00.000Z",
        }), encoding="utf-8")

        result = self.run_export([self.report])

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.mutex_path.exists())
        self.assertFalse(self.lock_path.exists())

    def test_concurrent_stale_mutex_recovery_has_one_owner_and_no_aba_cleanup(self):
        self.input_path.write_text(json.dumps([self.report], ensure_ascii=False), encoding="utf-8")
        self.mutex_path.mkdir()
        (self.mutex_path / "owner.json").write_text(json.dumps({
            "version": 1, "token": "dead-owner", "pid": 2147483647,
            "processStart": "1", "createdAt": "2026-09-26T00:00:00.000Z",
        }), encoding="utf-8")
        barrier = self.base / "mutex-barrier"
        barrier.mkdir()
        events = self.base / "mutex-events.log"
        injector = self.base / "concurrent-stale-mutex.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const mutex = path.resolve(process.env.PUBLICATION_MUTEX);
const barrier = path.resolve(process.env.MUTEX_BARRIER);
const events = path.resolve(process.env.MUTEX_EVENTS);
const transaction = path.resolve(process.env.PUBLICATION_TRANSACTION);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const src = path.resolve(String(source));
  const dst = path.resolve(String(destination));
  if (src === mutex && path.basename(dst).includes('.stale-')) {
    fs.writeFileSync(path.join(barrier, String(process.pid)), 'ready');
    const deadline = Date.now() + 5000;
    while (fs.readdirSync(barrier).length < 2 && Date.now() < deadline) sleep(10);
  }
  const result = originalRename.apply(this, arguments);
  if (dst === mutex && path.basename(src).includes('.candidate-')) {
    fs.appendFileSync(events, `acquire ${process.pid}\\n`);
  }
  if (src === mutex && path.basename(dst).includes('.release-')) {
    fs.appendFileSync(events, `release ${process.pid}\\n`);
  }
  return result;
};
const originalMkdir = fs.mkdirSync;
fs.mkdirSync = function (target, options) {
  const result = originalMkdir.apply(this, arguments);
  if (path.resolve(String(target)) === transaction) sleep(500);
  return result;
};
""",
            encoding="utf-8",
        )
        env = os.environ.copy()
        env.update({
            "NODE_OPTIONS": f"--require={injector}",
            "PUBLICATION_MUTEX": str(self.mutex_path),
            "PUBLICATION_TRANSACTION": str(self.lock_path),
            "MUTEX_BARRIER": str(barrier),
            "MUTEX_EVENTS": str(events),
        })
        processes = [subprocess.Popen(
            self.export_command(), cwd=ROOT, env=env, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        ) for _ in range(2)]
        results = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=15)
            results.append((process.returncode, stdout, stderr))

        self.assertEqual(sorted(code for code, _, _ in results), [0, 1], results)
        loser_error = next(stderr for code, _, stderr in results if code)
        self.assertIn("publication mutex owner process is alive", loser_error)
        self.assertNotIn("ENOENT", "".join(stderr for _, _, stderr in results))
        event_lines = events.read_text(encoding="utf-8").splitlines()
        self.assertEqual([line.split()[0] for line in event_lines], ["acquire", "release"])
        output = self.output_dir / f"{self.report['slug']}.html"
        self.assertIn(self.report["summary"], output.read_text(encoding="utf-8"))
        self.assertFalse(self.mutex_path.exists())
        self.assertFalse(self.lock_path.exists())
        self.assertEqual(list(self.base.glob(".report.html.publish.mutex.*")), [])

    def test_sigkill_during_mutex_candidate_initialization_is_recoverable(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        changed = dict(self.report, summary="후속 정상 실행에서만 공개할 변경", updated_at="2026-09-27T04:00:00+00:00")
        phases = ("before-owner-write", "before-owner-fsync", "after-mutex-publish")
        for phase in phases:
            with self.subTest(phase=phase):
                original = (
                    (self.output_dir / f"{self.report['slug']}.html").read_bytes(),
                    self.sitemap.read_bytes(), self.report_page.read_bytes(),
                )
                injector = self.base / f"kill-mutex-{phase}.cjs"
                injector.write_text(
                    """const fs = require('node:fs');
const path = require('node:path');
const phase = process.env.KILL_MUTEX_PHASE;
const mutex = path.resolve(process.env.PUBLICATION_MUTEX);
const ownerFds = new Set();
const originalOpen = fs.openSync;
fs.openSync = function (target) {
  const fd = originalOpen.apply(this, arguments);
  const value = path.resolve(String(target));
  if (path.basename(value) === 'owner.json' && path.basename(path.dirname(value)).includes('.candidate-')) ownerFds.add(fd);
  return fd;
};
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function (target) {
  const value = path.resolve(String(target));
  if (phase === 'before-owner-write' && path.basename(value) === 'owner.json' && path.basename(path.dirname(value)).includes('.candidate-')) process.kill(process.pid, 'SIGKILL');
  return originalWrite.apply(this, arguments);
};
const originalFsync = fs.fsyncSync;
fs.fsyncSync = function (fd) {
  if (phase === 'before-owner-fsync' && ownerFds.has(fd)) process.kill(process.pid, 'SIGKILL');
  return originalFsync.apply(this, arguments);
};
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const result = originalRename.apply(this, arguments);
  if (phase === 'after-mutex-publish' && path.resolve(String(destination)) === mutex && path.basename(String(source)).includes('.candidate-')) process.kill(process.pid, 'SIGKILL');
  return result;
};
""",
                    encoding="utf-8",
                )
                killed = self.run_export([changed], env={
                    "NODE_OPTIONS": f"--require={injector}",
                    "PUBLICATION_MUTEX": str(self.mutex_path),
                    "KILL_MUTEX_PHASE": phase,
                })
                self.assertNotEqual(killed.returncode, 0)
                self.assertEqual((
                    (self.output_dir / f"{self.report['slug']}.html").read_bytes(),
                    self.sitemap.read_bytes(), self.report_page.read_bytes(),
                ), original, "mutex initialization crash must precede journal/public changes")

                recovered = self.run_export([changed])
                self.assertEqual(recovered.returncode, 0, recovered.stderr)
                self.assertIn(changed["summary"], (self.output_dir / f"{self.report['slug']}.html").read_text(encoding="utf-8"))
                self.assertFalse(self.mutex_path.exists())
                self.assertFalse(self.lock_path.exists())
                self.assertEqual(list(self.base.glob(".report.html.publish.mutex.*")), [])

    def test_release_token_mismatch_fails_closed_without_deleting_claim(self):
        injector = self.base / "replace-release-token.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const mutex = path.resolve(process.env.PUBLICATION_MUTEX);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const src = path.resolve(String(source));
  const dst = path.resolve(String(destination));
  if (src === mutex && path.basename(dst).includes('.release-')) {
    const ownerPath = path.join(mutex, 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    owner.token = 'replacement-owner-token';
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        result = self.run_export([self.report], env={
            "NODE_OPTIONS": f"--require={injector}",
            "PUBLICATION_MUTEX": str(self.mutex_path),
        })

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("publication mutex ownership token mismatch", result.stderr)
        self.assertTrue(self.mutex_path.exists(), "replacement owner must be restored to the well-known mutex path")
        release_claims = list(self.base.glob(".report.html.publish.mutex.release-*"))
        self.assertEqual(release_claims, [])
        restored_owner = json.loads((self.mutex_path / "owner.json").read_text(encoding="utf-8"))
        self.assertEqual(restored_owner["token"], "replacement-owner-token")
        self.assertFalse(self.lock_path.exists())

        recovered = self.run_export([self.report])
        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        self.assertEqual(list(self.base.glob(".report.html.publish.mutex.*")), [])

    def test_stale_journal_rejects_target_outside_publication_scope(self):
        outside = self.base / "must-not-touch.txt"
        outside.write_text("operator data\n", encoding="utf-8")
        self.lock_path.mkdir()
        (self.lock_path / "staged").mkdir()
        (self.lock_path / "backups").mkdir()
        (self.lock_path / "owner.json").write_text(
            json.dumps({"pid": 2147483647, "createdAt": "2026-09-26T00:00:00.000Z"}),
            encoding="utf-8",
        )
        (self.lock_path / "journal.json").write_text(
            json.dumps({
                "version": 1,
                "phase": "committing",
                "progress": 0,
                "operations": [{
                    "target": str(outside),
                    "kind": "delete",
                    "staged": None,
                    "backup": None,
                    "originalHash": None,
                    "nextHash": None,
                }],
            }),
            encoding="utf-8",
        )

        result = self.run_export([self.report])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid publication journal operation", result.stderr)
        self.assertEqual(outside.read_text(encoding="utf-8"), "operator data\n")
        self.assertTrue(self.lock_path.exists(), "malformed recovery data must fail closed")

    def test_failed_publication_releases_lock(self):
        self.report_page.write_text("<html>invalid archive</html>\n", encoding="utf-8")

        result = self.run_export([self.report])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid report archive markers", result.stderr)
        self.assertFalse(self.lock_path.exists())

    def test_publication_does_not_rename_reports_directory(self):
        injector = self.base / "refuse-report-directory-rename.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const reports = path.resolve(process.env.REPORTS_DIRECTORY);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const paths = [source, destination].map((value) => path.resolve(String(value)));
  const touchesReportsDirectory = paths.some((value) => value === reports);
  const touchesStagedReportsDirectory = paths.some((value) => (
    path.basename(value) === 'next'
      && path.basename(path.dirname(value)).startsWith('.reports.publish-')
  ));
  if (touchesReportsDirectory || touchesStagedReportsDirectory) {
    const error = new Error('injected platform refusal for reports directory rename');
    error.code = 'EACCES';
    throw error;
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        second = dict(
            self.report,
            slug="2026-09-25-second-report",
            title="두 번째 리포트",
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )

        result = self.run_export(
            [self.report, second],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "REPORTS_DIRECTORY": str(self.output_dir),
            },
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.output_dir / f"{self.report['slug']}.html").exists())
        self.assertTrue((self.output_dir / f"{second['slug']}.html").exists())
        self.assertFalse(self.lock_path.exists())
        self.assertEqual(list(self.base.glob(".*.publish-*")), [])
        self.assertEqual(list(self.output_dir.glob(".*.publish-*")), [])

    def test_replacing_existing_files_never_exposes_a_missing_target(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        injector = self.base / "require-atomic-replace.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const targets = new Set(JSON.parse(process.env.PUBLICATION_TARGETS).map((value) => path.resolve(value)));
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const target = path.resolve(String(destination));
  if (targets.has(target) && !fs.existsSync(target)) {
    throw new Error(`atomic replacement observed missing target: ${target}`);
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        target = self.output_dir / f"{self.report['slug']}.html"
        changed = dict(self.report, summary="원자적으로 교체할 공개 변경", updated_at="2026-09-27T04:00:00+00:00")
        result = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "PUBLICATION_TARGETS": json.dumps([str(target), str(self.sitemap), str(self.report_page)]),
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(changed["summary"], target.read_text(encoding="utf-8"))

    def test_next_run_recovers_sigkill_mid_commit_and_publishes_coherently(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        injector = self.base / "kill-after-public-install.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const targets = new Set(JSON.parse(process.env.PUBLICATION_TARGETS).map((value) => path.resolve(value)));
const stopAfter = Number(process.env.STOP_AFTER || '1');
let installs = 0;
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const result = originalRename.apply(this, arguments);
  if (targets.has(path.resolve(String(destination))) && ++installs === stopAfter) process.kill(process.pid, 'SIGKILL');
  return result;
};
""",
            encoding="utf-8",
        )
        target = self.output_dir / f"{self.report['slug']}.html"
        changed = dict(self.report, summary="충돌 없이 복구 후 게시할 변경", updated_at="2026-09-27T04:00:00+00:00")
        killed = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "PUBLICATION_TARGETS": json.dumps([str(target), str(self.sitemap), str(self.report_page)]),
                "STOP_AFTER": "2",
            },
        )
        self.assertNotEqual(killed.returncode, 0)
        self.assertTrue(self.lock_path.exists(), "crashed transaction must remain recoverable")

        recovered = self.run_export([changed])

        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        self.assertIn(changed["summary"], target.read_text(encoding="utf-8"))
        self.assertIn("<lastmod>2026-09-27</lastmod>", self.sitemap.read_text(encoding="utf-8"))
        self.assertFalse(self.lock_path.exists())
        self.assertEqual(list(self.base.glob(".*.publish-*")), [])
        self.assertEqual(list(self.output_dir.glob(".*.publish-*")), [])

    def test_next_run_recovers_sigkill_after_stale_deletion(self):
        stale = dict(
            self.report,
            slug="2026-09-25-stale-report",
            title="삭제 중 중단될 리포트",
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([self.report, stale])
        self.assertEqual(first.returncode, 0, first.stderr)
        stale_path = self.output_dir / f"{stale['slug']}.html"
        injector = self.base / "kill-after-stale-delete.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const stale = path.resolve(process.env.STALE_TARGET);
const originalRm = fs.rmSync;
fs.rmSync = function (target, options) {
  const result = originalRm.apply(this, arguments);
  if (path.resolve(String(target)) === stale) process.kill(process.pid, 'SIGKILL');
  return result;
};
""",
            encoding="utf-8",
        )
        changed = dict(self.report, summary="삭제 복구 후 게시할 변경", updated_at="2026-09-27T04:00:00+00:00")
        killed = self.run_export(
            [changed],
            env={"NODE_OPTIONS": f"--require={injector}", "STALE_TARGET": str(stale_path)},
            allow_shrink=True,
        )
        self.assertNotEqual(killed.returncode, 0)
        self.assertFalse(stale_path.exists())
        self.assertTrue(self.lock_path.exists())

        recovered = self.run_export([changed], allow_shrink=True)

        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        self.assertFalse(stale_path.exists())
        self.assertIn(changed["summary"], (self.output_dir / f"{changed['slug']}.html").read_text(encoding="utf-8"))
        self.assertFalse(self.lock_path.exists())

    def test_rollback_preserves_concurrent_replacement_of_earlier_installed_target(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        target = self.output_dir / f"{self.report['slug']}.html"
        original = target.read_bytes()
        concurrent = b"operator replacement must survive\n"
        injector = self.base / "replace-earlier-target-before-later-failure.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const earlier = path.resolve(process.env.EARLIER_TARGET);
const later = path.resolve(process.env.LATER_TARGET);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const target = path.resolve(String(destination));
  if (target === later) {
    fs.writeFileSync(earlier, 'operator replacement must survive\\n');
    throw new Error('injected later publication failure');
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        changed = dict(self.report, summary="설치 후 충돌할 변경", updated_at="2026-09-27T04:00:00+00:00")
        result = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "EARLIER_TARGET": str(target),
                "LATER_TARGET": str(self.sitemap),
            },
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback conflict", result.stderr)
        self.assertIn(str(self.lock_path), result.stderr)
        self.assertEqual(target.read_bytes(), concurrent)
        self.assertTrue(self.lock_path.exists())
        backups = list((self.lock_path / "backups").glob("*"))
        self.assertTrue(any(item.read_bytes() == original for item in backups))

    def test_write_phase_failure_leaves_publication_byte_identical(self):
        older = dict(
            self.report,
            slug="2026-09-25-existing-report",
            title="기존 리포트",
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([self.report, older])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_reports = {
            path.name: path.read_bytes() for path in self.output_dir.glob("*.html")
        }
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()

        injector = self.base / "fail-publication-write.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(process.env.FAIL_PUBLICATION_TARGET);
let failed = false;
for (const method of ['writeFileSync', 'renameSync']) {
  const original = fs[method];
  fs[method] = function (...args) {
    const destination = method === 'renameSync' ? args[1] : args[0];
    if (!failed && path.resolve(String(destination)) === target) {
      failed = true;
      throw new Error('injected publication write failure');
    }
    return original.apply(this, args);
  };
}
""",
            encoding="utf-8",
        )
        changed = [
            dict(self.report, summary="실패 중에는 공개되면 안 되는 변경", updated_at="2026-09-27T04:00:00+00:00"),
            dict(older, summary="함께 롤백되어야 하는 변경", updated_at="2026-09-27T04:00:00+00:00"),
        ]

        result = self.run_export(
            changed,
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "FAIL_PUBLICATION_TARGET": str(self.report_page),
            },
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("injected publication write failure", result.stderr)
        self.assertEqual(
            {path.name: path.read_bytes() for path in self.output_dir.glob("*.html")},
            original_reports,
        )
        self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
        self.assertEqual(self.report_page.read_bytes(), original_report_page)

    def test_staging_failure_cleans_every_stage_and_preserves_publication(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_reports = {
            path.name: path.read_bytes() for path in self.output_dir.glob("*.html")
        }
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()

        injector = self.base / "fail-stage-write.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const phase = process.env.FAIL_STAGE_PHASE;
const indexes = { reports: '0', sitemap: '1', 'report-page': '2' };
const originalWrite = fs.writeFileSync;
fs.writeFileSync = function (target, ...args) {
  const normalized = path.resolve(String(target));
  const inStagedDirectory = path.basename(path.dirname(normalized)) === 'staged';
  if (inStagedDirectory && path.basename(normalized) === indexes[phase]) {
    throw new Error(`injected ${phase} staging failure`);
  }
  return originalWrite.call(this, target, ...args);
};
""",
            encoding="utf-8",
        )
        changed = dict(
            self.report,
            summary="스테이징 실패 중에는 공개되면 안 되는 변경",
            updated_at="2026-09-27T04:00:00+00:00",
        )

        for phase in ("reports", "sitemap", "report-page"):
            with self.subTest(phase=phase):
                result = self.run_export(
                    [changed],
                    env={
                        "NODE_OPTIONS": f"--require={injector}",
                        "FAIL_STAGE_PHASE": phase,
                        "REPORTS_DIRECTORY": str(self.output_dir),
                    },
                )

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"injected {phase} staging failure", result.stderr)
                self.assertEqual(
                    {path.name: path.read_bytes() for path in self.output_dir.glob("*.html")},
                    original_reports,
                )
                self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
                self.assertEqual(self.report_page.read_bytes(), original_report_page)
                roots = list(self.base.glob(".*.publish-*")) + list(
                    self.output_dir.glob(".*.publish-*")
                )
                try:
                    self.assertEqual(roots, [], f"orphaned staging roots: {roots}")
                finally:
                    for root in roots:
                        if root.is_dir():
                            for child in sorted(root.rglob("*"), reverse=True):
                                if child.is_dir():
                                    child.rmdir()
                                else:
                                    child.unlink()
                            root.rmdir()

    def test_rollback_failure_preserves_original_backups_and_continues_restoration(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_report = (self.output_dir / f"{self.report['slug']}.html").read_bytes()
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()

        injector = self.base / "fail-publication-and-rollback.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const reportPage = path.resolve(process.env.FAIL_REPORT_PAGE);
const sitemap = path.resolve(process.env.FAIL_SITEMAP);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  const target = path.resolve(String(destination));
  if (target === reportPage) throw new Error('injected publication failure');
  if (target === sitemap && path.basename(String(source)).startsWith('restore-')) {
    throw new Error('injected backup restore failure');
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        changed = dict(
            self.report,
            summary="롤백 실패 시 공개 상태에 남을 변경",
            updated_at="2026-09-27T04:00:00+00:00",
        )

        result = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "FAIL_REPORT_PAGE": str(self.report_page),
                "FAIL_SITEMAP": str(self.sitemap),
            },
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback failed", result.stderr)
        self.assertIn("injected backup restore failure", result.stderr)
        self.assertEqual(
            (self.output_dir / f"{self.report['slug']}.html").read_bytes(),
            original_report,
            "rollback must continue restoring operations that can be restored",
        )
        self.assertEqual(self.report_page.read_bytes(), original_report_page)
        self.assertTrue(self.lock_path.exists())
        self.assertEqual((self.lock_path / "backups" / "1").read_bytes(), original_sitemap)
        self.assertEqual((self.lock_path / "backups" / "2").read_bytes(), original_report_page)
        self.assertIn(f"preserved recovery root: {self.lock_path}", result.stderr)

    def test_rollback_reports_conflict_when_concurrent_publisher_recreates_target(self):
        first = self.run_export([self.report])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_report = (self.output_dir / f"{self.report['slug']}.html").read_bytes()
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()

        injector = self.base / "recreate-target-before-failed-install.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const reportPage = path.resolve(process.env.FAIL_REPORT_PAGE);
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  if (path.resolve(String(destination)) === reportPage) {
    fs.writeFileSync(reportPage, 'concurrent publisher\\n');
    throw new Error('injected publication failure after concurrent replacement');
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        changed = dict(
            self.report,
            summary="동시 게시 충돌 중에는 공개되면 안 되는 변경",
            updated_at="2026-09-27T04:00:00+00:00",
        )

        result = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "FAIL_REPORT_PAGE": str(self.report_page),
            },
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("injected publication failure after concurrent replacement", result.stderr)
        self.assertIn("rollback conflict", result.stderr)
        self.assertEqual(
            (self.output_dir / f"{self.report['slug']}.html").read_bytes(),
            original_report,
            "rollback must continue restoring operations that can be restored",
        )
        self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
        self.assertEqual(self.report_page.read_bytes(), b"concurrent publisher\n")
        self.assertTrue(self.lock_path.exists(), result.stderr)
        self.assertEqual((self.lock_path / "backups" / "2").read_bytes(), original_report_page)
        self.assertIn(f"preserved recovery root: {self.lock_path}", result.stderr)

    def test_allow_shrink_restores_stale_report_when_later_publication_fails(self):
        stale = dict(
            self.report,
            slug="2026-09-25-stale-report",
            title="삭제 예정 리포트",
            created_at="2026-09-25T03:00:00+00:00",
            updated_at="2026-09-25T04:00:00+00:00",
        )
        first = self.run_export([self.report, stale])
        self.assertEqual(first.returncode, 0, first.stderr)
        original_reports = {
            path.name: path.read_bytes() for path in self.output_dir.glob("*.html")
        }
        original_sitemap = self.sitemap.read_bytes()
        original_report_page = self.report_page.read_bytes()

        injector = self.base / "fail-after-stale-delete.cjs"
        injector.write_text(
            """const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(process.env.FAIL_PUBLICATION_TARGET);
let failed = false;
const originalRename = fs.renameSync;
fs.renameSync = function (source, destination) {
  if (!failed && path.resolve(String(destination)) === target) {
    failed = true;
    throw new Error('injected failure after transactional stale deletion');
  }
  return originalRename.apply(this, arguments);
};
""",
            encoding="utf-8",
        )
        changed = dict(
            self.report,
            summary="실패한 축소 게시에 포함되면 안 되는 변경",
            updated_at="2026-09-27T04:00:00+00:00",
        )

        result = self.run_export(
            [changed],
            env={
                "NODE_OPTIONS": f"--require={injector}",
                "FAIL_PUBLICATION_TARGET": str(self.report_page),
            },
            allow_shrink=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("injected failure after transactional stale deletion", result.stderr)
        self.assertEqual(
            {path.name: path.read_bytes() for path in self.output_dir.glob("*.html")},
            original_reports,
        )
        self.assertEqual(self.sitemap.read_bytes(), original_sitemap)
        self.assertEqual(self.report_page.read_bytes(), original_report_page)
        self.assertEqual(list(self.output_dir.glob(".*.publish-*")), [])
        self.assertEqual(list(self.base.glob(".*.publish-*")), [])

        successful = self.run_export([changed], allow_shrink=True)
        self.assertEqual(successful.returncode, 0, successful.stderr)
        self.assertFalse((self.output_dir / f"{stale['slug']}.html").exists())
        self.assertIn(
            changed["summary"],
            (self.output_dir / f"{changed['slug']}.html").read_text(encoding="utf-8"),
        )
        self.assertEqual(list(self.output_dir.glob(".*.publish-*")), [])
        self.assertEqual(list(self.base.glob(".*.publish-*")), [])

    def test_rejects_unsafe_slug_without_writing_outside_output(self):
        report = dict(self.report, slug="../escape")
        result = self.run_export([report])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / "escape.html").exists())

    def test_rejects_unexpected_report_set_shrink_before_writing(self):
        old_slug = "2026-09-25-existing-report"
        old_page = self.output_dir / f"{old_slug}.html"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        old_page.write_text("existing", encoding="utf-8")
        original_sitemap = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f'  <url><loc>https://lottes.co.kr/reports/{old_slug}.html</loc></url>\n'
            '</urlset>\n'
        )
        self.sitemap.write_text(original_sitemap, encoding="utf-8")
        replacement = dict(self.report)
        replacement["slug"] = "2026-09-26-replacement-report"
        result = self.run_export([replacement])

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to remove published report snapshots", result.stderr)
        self.assertTrue(old_page.exists())
        self.assertFalse((self.output_dir / f'{replacement["slug"]}.html').exists())
        self.assertEqual(self.sitemap.read_text(encoding="utf-8"), original_sitemap)


if __name__ == "__main__":
    unittest.main()
