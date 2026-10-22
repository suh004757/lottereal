import base64
import hashlib
import io
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCANNER = ROOT / "scripts" / "scan_pages_artifact.py"
BUILDER = ROOT / "scripts" / "build_pages_artifact.py"
PRODUCTION_ALLOWLIST = ROOT / "security" / "pages-artifact-allowlist.json"


def jwt(role: str) -> str:
    def encode(value):
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{encode({'alg': 'HS256', 'typ': 'JWT'})}.{encode({'role': role, 'ref': 'test'})}.signature_value"


class PagesArtifactSecurityTests(unittest.TestCase):
    def scan(self, files, allowed=(), allowed_google=()):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            artifact = root / "site"
            artifact.mkdir()
            for relative, body in files.items():
                path = artifact / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body if isinstance(body, bytes) else body.encode())
            allowlist = root / "allowlist.json"
            allowlist.write_text(
                json.dumps(
                    {
                        "schema": 1,
                        "supabase_browser_anon_sha256": [
                            hashlib.sha256(value.encode()).hexdigest() for value in allowed
                        ],
                        "google_browser_api_key_sha256": [
                            hashlib.sha256(value.encode()).hexdigest() for value in allowed_google
                        ],
                    }
                ),
                encoding="utf-8",
            )
            return subprocess.run(
                ["python3", str(SCANNER), "--artifact", str(artifact), "--allowlist", str(allowlist)],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )

    def test_exact_allowlisted_supabase_anon_jwt_is_accepted(self):
        token = jwt("anon")
        result = self.scan({"js/config.js": f'const key = "{token}";'}, allowed=(token,))
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('"ok": true', result.stdout.lower())
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_only_digest_allowlisted_browser_google_key_is_accepted(self):
        approved = "AIza" + "A" * 35
        unapproved = "AIza" + "B" * 35
        accepted = self.scan({"js/maps.js": f'const key = "{approved}";'}, allowed_google=(approved,))
        self.assertEqual(0, accepted.returncode, accepted.stdout + accepted.stderr)
        rejected = self.scan({"js/maps.js": f'const key = "{unapproved}";'}, allowed_google=(approved,))
        self.assertNotEqual(0, rejected.returncode)
        self.assertIn("unallowlisted_google_browser_key", rejected.stdout + rejected.stderr)
        self.assertNotIn(unapproved, rejected.stdout + rejected.stderr)

    def test_unlisted_anon_and_service_role_jwts_are_rejected_without_values(self):
        anon = jwt("anon")
        service = jwt("service_role")
        result = self.scan({"nested/app.js": f'const a="{anon}"; const b="{service}";'}, allowed=(service,))
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("unallowlisted_supabase_anon", output)
        self.assertIn("supabase_service_role", output)
        self.assertNotIn(anon, output)
        self.assertNotIn(service, output)

    def test_non_anon_jwt_is_rejected_as_a_generic_credential(self):
        token = jwt("authenticated")
        result = self.scan({"assets/session.js": f'const token = "{token}";'})
        self.assertNotEqual(0, result.returncode)
        self.assertIn("jwt_token", result.stdout + result.stderr)
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_private_artifacts_and_pii_shaped_exports_are_rejected(self):
        result = self.scan(
            {
                ".env.production": "SAFE_NAME=not-a-real-value",
                "keys/server.pem": "placeholder",
                "exports/customer-contacts.csv": "name,email\nPerson,person@example.test\n",
            }
        )
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("environment_file", output)
        self.assertIn("private_key_artifact", output)
        self.assertIn("pii_export_artifact", output)
        self.assertNotIn("person@example.test", output)

    def test_neutral_json_name_with_customer_export_schema_is_rejected_without_values(self):
        private_email = "private.person@example.test"
        result = self.scan(
            {
                "backup.json": json.dumps(
                    [{"customer_name": "Private Person", "email": private_email, "phone": "010-1234-5678"}]
                )
            }
        )
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("pii_export_content", output)
        self.assertNotIn(private_email, output)
        self.assertNotIn("Private Person", output)
        self.assertNotIn("010-1234-5678", output)

    def test_disguised_delimited_customer_export_is_rejected_without_values(self):
        private_email = "delimited.person@example.test"
        body = f"customer_name,email,phone\nPrivate Person,{private_email},010-4567-8901\n"
        result = self.scan({"assets/notes.txt": body})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("pii_export_content", output)
        self.assertNotIn(private_email, output)
        self.assertNotIn("Private Person", output)

    def test_zip_archive_with_customer_csv_is_rejected_without_extracting_values(self):
        private_email = "zip.person@example.test"
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("customer.csv", f"name,email\nPrivate Person,{private_email}\n")
        result = self.scan({"assets/backup.zip": buffer.getvalue()})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("unapproved_archive", output)
        self.assertNotIn(private_email, output)
        self.assertNotIn("Private Person", output)

    def test_disguised_zip_archive_is_rejected_by_signature(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("safe.txt", "not actually safe")
        result = self.scan({"assets/backup.bin": buffer.getvalue()})
        self.assertNotEqual(0, result.returncode)
        self.assertIn("unapproved_archive", result.stdout + result.stderr)

    def test_korean_named_csv_export_is_rejected_without_printing_values(self):
        private_phone = "010-9999-8888"
        result = self.scan({"downloads/고객명단.csv": f"이름,전화번호\n홍길동,{private_phone}\n"})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("unapproved_data_export", output)
        self.assertNotIn(private_phone, output)
        self.assertNotIn("홍길동", output)

    def test_neutral_archive_spreadsheet_database_sql_and_csv_names_are_rejected(self):
        files = {
            "assets/a.zip": b"placeholder",
            "assets/b.xlsx": b"placeholder",
            "assets/c.sqlite": b"placeholder",
            "assets/d.sql": b"placeholder",
            "assets/e.csv": b"placeholder",
        }
        result = self.scan(files)
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("unapproved_archive", output)
        self.assertIn("unapproved_data_export", output)
        for relative in files:
            self.assertIn(relative, output)

    def test_sql_dump_disguised_as_text_is_rejected_without_printing_values(self):
        private_email = "sql.person@example.test"
        sql = f"CREATE TABLE contacts (name text, email text); INSERT INTO contacts VALUES ('Private', '{private_email}');"
        result = self.scan({"assets/seed.txt": sql})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("unapproved_data_export", output)
        self.assertNotIn(private_email, output)

    def test_common_credentials_and_private_key_content_are_rejected_without_values(self):
        github = "ghp_" + "A" * 36
        aws = "AKIA" + "B" * 16
        private_key = "-----BEGIN PRIVATE KEY-----\nnot-real\n-----END PRIVATE KEY-----"
        result = self.scan({"assets/data.txt": f"{github}\n{aws}\n{private_key}\n"})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("github_token", output)
        self.assertIn("aws_access_key", output)
        self.assertIn("private_key_content", output)
        self.assertNotIn(github, output)
        self.assertNotIn(aws, output)
        self.assertNotIn("not-real", output)

    def test_binary_files_are_scanned_for_credential_signatures(self):
        token = b"xoxb-" + b"1" * 12 + b"-" + b"2" * 12 + b"-" + b"A" * 24
        result = self.scan({"img/blob.bin": b"\x00prefix" + token + b"suffix"})
        self.assertNotEqual(0, result.returncode)
        self.assertIn("slack_token", result.stdout + result.stderr)
        self.assertNotIn(token.decode(), result.stdout + result.stderr)

    def test_utf16le_encoded_token_is_rejected_without_printing_value(self):
        token = "ghp_" + "U" * 36
        result = self.scan({"assets/localization.txt": ("safe prefix " + token).encode("utf-16le")})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("github_token", output)
        self.assertNotIn(token, output)

    def test_executable_split_supabase_secret_construction_is_rejected_without_values(self):
        suffix = "S" * 28
        result = self.scan({"js/runtime.js": f'const key = "sb_" + "secret_" + "{suffix}";'})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("split_secret_construction", output)
        self.assertNotIn(suffix, output)

    def test_bearer_tokens_and_database_credentials_are_rejected(self):
        bearer = "Bearer " + "Z" * 32
        database = "postgresql://app:password-value@database.example.test/app"
        result = self.scan({"assets/runtime.js": f'const auth = "{bearer}"; const db = "{database}";'})
        self.assertNotEqual(0, result.returncode)
        output = result.stdout + result.stderr
        self.assertIn("bearer_token", output)
        self.assertIn("database_url", output)
        self.assertNotIn(bearer, output)
        self.assertNotIn(database, output)

    def test_complete_production_artifact_passes_only_the_committed_digest_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            artifact = Path(tmp) / "site"
            manifest = Path(tmp) / "manifest.json"
            build = subprocess.run(
                [
                    "python3",
                    str(BUILDER),
                    "--output",
                    str(artifact),
                    "--manifest",
                    str(manifest),
                    "--revision",
                    "a" * 40,
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
            self.assertEqual(0, build.returncode, build.stderr)
            result = subprocess.run(
                ["python3", str(SCANNER), "--artifact", str(artifact), "--allowlist", str(PRODUCTION_ALLOWLIST)],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        allowlist = json.loads(PRODUCTION_ALLOWLIST.read_text(encoding="utf-8"))
        self.assertEqual(1, len(allowlist["supabase_browser_anon_sha256"]))
        self.assertEqual([], allowlist["google_browser_api_key_sha256"])
        self.assertNotIn("eyJ", PRODUCTION_ALLOWLIST.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
