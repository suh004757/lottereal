import hashlib
import http.server
import json
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / "scripts" / "verify_pages_deployment.py"
REVISION = "a" * 40
STALE_REVISION = "b" * 40


def encoded_manifest(revision, files):
    data = {
        "schema": 2,
        "revision": revision,
        "files": {
            name: {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
            for name, body in sorted(files.items())
        },
    }
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


class DeploymentServer:
    def __init__(self, responses):
        self.responses = {path: list(values) for path, values in responses.items()}
        self.counts = {}
        owner = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                path = self.path.split("?", 1)[0].lstrip("/")
                owner.counts[path] = owner.counts.get(path, 0) + 1
                values = owner.responses.get(path)
                if not values:
                    self.send_response(404)
                    self.end_headers()
                    return
                status, body = values.pop(0) if len(values) > 1 else values[0]
                self.send_response(status)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format, *args):
                del format, args

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_port}/"

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


class PagesDeploymentVerifierTests(unittest.TestCase):
    def run_verifier(self, server, manifest, attempts=1):
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = Path(tmp) / "manifest.json"
            manifest_path.write_bytes(manifest)
            digest = hashlib.sha256(manifest).hexdigest()
            return subprocess.run(
                [
                    "python3",
                    str(VERIFIER),
                    "--base-url",
                    server.url,
                    "--expected-revision",
                    REVISION,
                    "--expected-manifest-sha256",
                    digest,
                    "--attempts",
                    str(attempts),
                    "--retry-seconds",
                    "0",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )

    def test_retries_stale_deployment_until_exact_manifest_and_hashes_are_live(self):
        files = {"index.html": b"healthy homepage", "js/app.js": b"console.log('ok')"}
        expected = encoded_manifest(REVISION, files)
        stale = encoded_manifest(STALE_REVISION, files)
        server = DeploymentServer(
            {
                "pages-manifest.json": [(200, stale), (200, expected)],
                **{name: [(200, body)] for name, body in files.items()},
            }
        )
        try:
            result = self.run_verifier(server, expected, attempts=2)
        finally:
            server.close()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(2, server.counts["pages-manifest.json"])
        self.assertIn('"ok": true', result.stdout.lower())
        self.assertIn('"health": "ok"', result.stdout.lower())

    def test_never_accepts_stale_manifest_even_when_file_hashes_match(self):
        files = {"index.html": b"healthy homepage"}
        expected = encoded_manifest(REVISION, files)
        stale = encoded_manifest(STALE_REVISION, files)
        server = DeploymentServer({"pages-manifest.json": [(200, stale)]})
        try:
            result = self.run_verifier(server, expected, attempts=2)
        finally:
            server.close()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("manifest_sha256_mismatch", result.stdout + result.stderr)
        self.assertNotIn("healthy homepage", result.stdout + result.stderr)

    def test_rejects_live_content_whose_hash_differs_from_built_manifest(self):
        files = {"index.html": b"healthy homepage", "js/app.js": b"expected"}
        expected = encoded_manifest(REVISION, files)
        server = DeploymentServer(
            {
                "pages-manifest.json": [(200, expected)],
                "index.html": [(200, files["index.html"])],
                "js/app.js": [(200, b"stale123")],
            }
        )
        try:
            result = self.run_verifier(server, expected)
        finally:
            server.close()
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("sha256_mismatch", output)
        self.assertNotIn("expected", output)
        self.assertNotIn("stale", output)

    def test_rejects_unsafe_manifest_paths_before_fetching_them(self):
        manifest = (
            json.dumps(
                {
                    "schema": 2,
                    "revision": REVISION,
                    "files": {
                        "index.html": {"bytes": 1, "sha256": hashlib.sha256(b"x").hexdigest()},
                        "../private": {"bytes": 1, "sha256": hashlib.sha256(b"x").hexdigest()},
                    },
                },
                sort_keys=True,
            )
            + "\n"
        ).encode()
        server = DeploymentServer({"pages-manifest.json": [(200, manifest)]})
        try:
            result = self.run_verifier(server, manifest)
        finally:
            server.close()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("unsafe_manifest_path", result.stdout + result.stderr)
        self.assertNotIn("private", server.counts)


if __name__ == "__main__":
    unittest.main()
