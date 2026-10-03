from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


class SecurityDependencyTest(unittest.TestCase):
    def test_public_report_uses_pinned_self_hosted_markdown_security_dependencies(self):
        html = (PUBLIC / "report.html").read_text(encoding="utf-8")
        self.assertIn('src="js/vendor/dompurify-3.4.15.min.js"', html)
        self.assertIn('src="js/vendor/marked-18.0.11.min.js"', html)
        self.assertNotIn("cdn.jsdelivr.net/npm/dompurify", html)
        self.assertNotIn("cdn.jsdelivr.net/npm/marked", html)
        self.assertTrue((PUBLIC / "js/vendor/dompurify-3.4.15.min.js").is_file())
        self.assertTrue((PUBLIC / "js/vendor/marked-18.0.11.min.js").is_file())

    def test_admin_editor_uses_native_textarea_without_simplemde(self):
        for relative_path in ["admin/report-editor.html", "admin/dashboard.html"]:
            html = (PUBLIC / relative_path).read_text(encoding="utf-8")
            self.assertNotIn("simplemde", html.lower(), relative_path)
        core = (PUBLIC / "js/reportEditorCore.js").read_text(encoding="utf-8")
        self.assertNotIn("SimpleMDE", core)
        self.assertNotIn("simplemde", core.lower())
        self.assertIn("refs.contentInput.value", core)

    def test_pages_do_not_load_legacy_bootstrap_or_popper_javascript(self):
        offenders = []
        for path in PUBLIC.rglob("*.html"):
            html = path.read_text(encoding="utf-8-sig").lower()
            if "js/bootstrap.min.js" in html or "js/popper.min.js" in html:
                offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual(offenders, [])
        self.assertFalse((PUBLIC / "js/bootstrap.min.js").exists())
        self.assertFalse((PUBLIC / "js/popper.min.js").exists())
        self.assertFalse((PUBLIC / "js/active.js").exists())
        self.assertFalse((PUBLIC / "js/plugins.js").exists())
        self.assertFalse((PUBLIC / "js/jquery/jquery-3.7.1.min.js").exists())


if __name__ == "__main__":
    unittest.main()
