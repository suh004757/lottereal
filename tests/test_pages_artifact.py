import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BUILD_SCRIPT = ROOT / "scripts" / "build_pages_artifact.py"
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-pages.yml"
PUBLIC_DIRECTORIES = ("Data", "admin", "css", "fonts", "img", "js", "redirect", "reports")
EXCLUDED_DIRECTORIES = ("content", "scripts", "scss", "supabase", "tests", ".agent")
REQUIRED_ROOT_FILES = (
    "CNAME",
    "Sitemap.xml",
    "robots.txt",
    "style.css",
    "style.css.map",
    "404.md",
)
PINNED_ACTIONS = {
    "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
    "actions/configure-pages": "983d7736d9b0ae728b81ab479565c72886d7745b",
    "actions/upload-pages-artifact": "56afc609e74202658d3ffba0e8f6dda462b719fa",
    "actions/deploy-pages": "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PagesArtifactTests(unittest.TestCase):
    def build(self, output, manifest):
        return subprocess.run(
            ["python3", str(BUILD_SCRIPT), "--output", str(output), "--manifest", str(manifest)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def test_artifact_preserves_public_routes_and_excludes_repository_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "site"
            manifest = Path(tmp) / "manifest.json"
            result = self.build(output, manifest)
            self.assertEqual(0, result.returncode, result.stderr)

            source_files = sorted(
                path.relative_to(PUBLIC) for path in PUBLIC.rglob("*") if path.is_file()
            )
            artifact_files = sorted(
                path.relative_to(output)
                for path in output.rglob("*")
                if path.is_file() and path.name != ".nojekyll"
            )
            self.assertEqual(source_files, artifact_files)
            for relative in source_files:
                self.assertEqual(digest(PUBLIC / relative), digest(output / relative), relative)
            for name in REQUIRED_ROOT_FILES:
                self.assertEqual(digest(PUBLIC / name), digest(output / name), name)
            for directory in EXCLUDED_DIRECTORIES:
                self.assertFalse((output / directory).exists(), directory)
            for name in ("README.md", "DEPLOY.md", "AGENTS.md", ".env.example"):
                self.assertFalse((output / name).exists(), name)
            self.assertTrue((output / ".nojekyll").is_file())

    def test_build_replaces_stale_output_and_manifest_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "site"
            manifest = Path(tmp) / "manifest.json"
            output.mkdir()
            (output / "stale-secret.txt").write_text("must disappear")
            first = self.build(output, manifest)
            self.assertEqual(0, first.returncode, first.stderr)
            self.assertFalse((output / "stale-secret.txt").exists())
            first_manifest = manifest.read_bytes()
            second = self.build(output, manifest)
            self.assertEqual(0, second.returncode, second.stderr)
            self.assertEqual(first_manifest, manifest.read_bytes())
            data = json.loads(first_manifest)
            self.assertEqual(sorted(data["files"]), list(data["files"]))
            self.assertNotIn("generated_at", data)

    def test_readme_documents_workflow_artifact_as_the_deployment_boundary(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        deploy = (ROOT / "DEPLOY.md").read_text(encoding="utf-8")
        for text in (readme, deploy):
            self.assertIn("GitHub Actions", text)
            self.assertIn("scripts/build_pages_artifact.py", text)
            self.assertIn("scripts/`, `tests/`, `supabase/`, `content/`, `scss/`", text)
        self.assertNotIn("현재 GitHub Pages는 **`main /`**를 그대로 배포", readme)

    def test_pages_workflow_is_minimal_pinned_and_deploys_only_the_artifact(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("pull_request:", text)
        self.assertIn("push:\n    branches: [main]", text)
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("permissions: {}", text)
        self.assertIn("contents: read", text)
        self.assertIn("pages: write", text)
        self.assertIn("id-token: write", text)
        build = text.split("  build:", 1)[1].split("  deploy:", 1)[0]
        deploy = text.split("  deploy:", 1)[1]
        self.assertIn("if: github.event_name != 'pull_request'", deploy)
        self.assertNotIn("pages: write", build)
        self.assertNotIn("id-token: write", build)
        self.assertNotIn("actions/checkout", deploy)
        self.assertIn("python3 scripts/build_pages_artifact.py", text)
        self.assertIn("path: ${{ runner.temp }}/site", text)
        self.assertNotIn("secrets.", text)
        for action, sha in PINNED_ACTIONS.items():
            self.assertIn(f"{action}@{sha}", text)


if __name__ == "__main__":
    unittest.main()
