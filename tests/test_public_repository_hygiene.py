import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
OFFICE_SOURCE_SUFFIXES = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}
PUBLIC_OFFICE_PREFIXES = ("downloads/",)
MAX_TRACKED_FILE_BYTES = 2_000_000


def tracked_files():
    output = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT
    ).decode("utf-8").split("\0")
    return [path for path in output if path]


def indexed_blob_sizes():
    output = subprocess.check_output(
        ["git", "ls-files", "--stage", "-z"], cwd=ROOT
    ).decode("utf-8").split("\0")
    entries = []
    for row in output:
        if not row:
            continue
        metadata, path = row.split("\t", 1)
        _mode, object_id, stage = metadata.split()
        if stage == "0":
            entries.append((path, object_id))

    process = subprocess.run(
        ["git", "cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
        cwd=ROOT,
        input="".join(f"{object_id}\n" for _path, object_id in entries),
        text=True,
        capture_output=True,
        check=True,
    )
    sizes = {}
    for (path, expected_id), row in zip(entries, process.stdout.splitlines(), strict=True):
        object_id, object_type, size = row.split()
        if object_id != expected_id or object_type != "blob":
            raise AssertionError(f"unexpected index object for {path}: {row}")
        sizes[path] = int(size)
    return sizes


class PublicRepositoryHygieneTests(unittest.TestCase):
    def test_office_source_documents_are_not_git_tracked(self):
        offenders = [
            path for path in tracked_files()
            if Path(path).suffix.lower() in OFFICE_SOURCE_SUFFIXES
            and not path.startswith(PUBLIC_OFFICE_PREFIXES)
        ]
        self.assertEqual([], offenders)

    def test_large_tracked_blobs_require_an_explicit_architecture_change(self):
        offenders = [
            (path, size)
            for path, size in indexed_blob_sizes().items()
            if size > MAX_TRACKED_FILE_BYTES
        ]
        self.assertEqual([], offenders)

    def test_readme_documents_the_current_deployment_boundary_and_layout(self):
        content = README.read_text(encoding="utf-8")
        expected_routes = {
            "index.html": "https://lottes.co.kr/",
            "listings.html": "https://lottes.co.kr/listings.html",
            "report.html": "https://lottes.co.kr/report.html",
        }
        for path, url in expected_routes.items():
            self.assertTrue((ROOT / path).is_file(), path)
            self.assertIn(f"`{path}` → `{url}`", content)

        for directory in ("reports", "content", "scripts", "tests", "supabase"):
            self.assertTrue((ROOT / directory).is_dir(), directory)
            self.assertIn(f"| `{directory}/` |", content)

        exporter = (ROOT / "scripts" / "export_static_reports.mjs").read_text(
            encoding="utf-8"
        )
        for output_name in ("reports", "Sitemap.xml", "report.html"):
            self.assertIn(output_name, exporter)
            self.assertIn(f"`{output_name}", content)

        phase_positions = [content.index(f"### Phase {number}") for number in (1, 2, 3)]
        self.assertEqual(sorted(phase_positions), phase_positions)
        self.assertIn("GitHub Actions workflow artifact", content)
        self.assertIn("DOCX 직접 다운로드 URL은 의도적으로 종료", content)
        self.assertIn("PR 완료 댓글과 독립 review 결과", content)


if __name__ == "__main__":
    unittest.main()
