from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SecurityDependencyTest(unittest.TestCase):
    def test_public_report_uses_pinned_self_hosted_markdown_security_dependencies(self):
        html = (ROOT / "report.html").read_text(encoding="utf-8")
        self.assertIn('src="js/vendor/dompurify-3.4.15.min.js"', html)
        self.assertIn('src="js/vendor/marked-18.0.11.min.js"', html)
        self.assertNotIn("cdn.jsdelivr.net/npm/dompurify", html)
        self.assertNotIn("cdn.jsdelivr.net/npm/marked", html)
        self.assertTrue((ROOT / "js/vendor/dompurify-3.4.15.min.js").is_file())
        self.assertTrue((ROOT / "js/vendor/marked-18.0.11.min.js").is_file())

    def test_admin_editor_uses_native_textarea_without_simplemde(self):
        for relative_path in ["admin/report-editor.html", "admin/dashboard.html"]:
            html = (ROOT / relative_path).read_text(encoding="utf-8")
            self.assertNotIn("simplemde", html.lower(), relative_path)
        core = (ROOT / "js/reportEditorCore.js").read_text(encoding="utf-8")
        self.assertNotIn("SimpleMDE", core)
        self.assertNotIn("simplemde", core.lower())
        self.assertIn("refs.contentInput.value", core)

    def test_pages_do_not_load_legacy_bootstrap_or_popper_javascript(self):
        offenders = []
        for path in ROOT.rglob("*.html"):
            html = path.read_text(encoding="utf-8-sig").lower()
            if "js/bootstrap.min.js" in html or "js/popper.min.js" in html:
                offenders.append(str(path.relative_to(ROOT)))
        self.assertEqual(offenders, [])
        active_js = (ROOT / "js/active.js").read_text(encoding="utf-8-sig")
        self.assertNotIn(".tooltip()", active_js)
        self.assertFalse((ROOT / "js/bootstrap.min.js").exists())
        self.assertFalse((ROOT / "js/popper.min.js").exists())


if __name__ == "__main__":
    unittest.main()
