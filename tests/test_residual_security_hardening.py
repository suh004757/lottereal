import importlib.util
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_JSDELIVR_URLS = {
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.65.0/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/functions-js@2.4.1/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/node-fetch@2.6.15/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@1.16.1/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/realtime-js@2.10.2/+esm',
    'https://cdn.jsdelivr.net/npm/@supabase/storage-js@2.7.0/+esm',
    'https://cdn.jsdelivr.net/npm/ws@8.17.1/+esm',
}
JSDELIVR_CSP_SOURCES = ' '.join(sorted(ALLOWED_JSDELIVR_URLS))
STANDARD_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-src 'none'; "
    f"script-src 'self' {JSDELIVR_CSP_SOURCES} https://www.googletagmanager.com; "
    "script-src-attr 'none'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co https://www.google-analytics.com https://region1.google-analytics.com; "
    "form-action 'self'; "
    "upgrade-insecure-requests"
)
ADMIN_CSP = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-src 'none'; "
    f"script-src 'self' {JSDELIVR_CSP_SOURCES}; "
    "script-src-attr 'none'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' https://itcztvceelfvppjwhmvl.supabase.co; "
    "form-action 'self'; "
    "upgrade-insecure-requests"
)
EXCLUDED_HTML = {
    ROOT / 'naver8cf28dd9c8569f7f73da84b1adf5a2fb.html',
    ROOT / 'redirect' / 'zigbang-inquiry.html',
}


def deployed_html():
    return sorted(path for path in ROOT.glob('**/*.html') if '.git' not in path.parts)


def load_maintenance_module():
    spec = importlib.util.spec_from_file_location('maintenance_check', ROOT / 'scripts' / 'maintenance_check.py')
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ResidualSecurityHardeningTest(unittest.TestCase):
    def test_unused_legacy_plugin_bundle_is_removed(self):
        for obsolete in ('js/plugins.js', 'js/active.js', 'js/jquery/jquery-3.7.1.min.js'):
            self.assertFalse((ROOT / obsolete).exists(), obsolete)
        for html in deployed_html():
            source = html.read_text(encoding='utf-8', errors='replace')
            rel = str(html.relative_to(ROOT))
            for marker in ('js/plugins.js', 'js/active.js', 'js/jquery/jquery-3.7.1.min.js'):
                self.assertNotIn(marker, source, rel)

    def test_every_application_page_has_restrictive_csp_and_referrer_policy(self):
        for html in deployed_html():
            if html in EXCLUDED_HTML:
                continue
            source = html.read_text(encoding='utf-8', errors='replace')
            expected_csp = ADMIN_CSP if html.parent == ROOT / 'admin' else STANDARD_CSP
            self.assertIn(
                f'<meta http-equiv="Content-Security-Policy" content="{expected_csp}">',
                source,
                str(html.relative_to(ROOT)),
            )
            self.assertIn(
                '<meta name="referrer" content="strict-origin-when-cross-origin">',
                source,
                str(html.relative_to(ROOT)),
            )
            charset_at = source.lower().find('<meta charset=')
            csp_at = source.find(f'<meta http-equiv="Content-Security-Policy" content="{expected_csp}">')
            self.assertGreater(charset_at, 0, str(html.relative_to(ROOT)))
            self.assertLess(len(source[:charset_at].encode('utf-8')), 1024, str(html.relative_to(ROOT)))
            self.assertLess(charset_at, csp_at, str(html.relative_to(ROOT)))

    def test_no_executable_inline_scripts_importmaps_or_event_handlers_remain(self):
        for html in deployed_html():
            source = html.read_text(encoding='utf-8', errors='replace')
            rel = str(html.relative_to(ROOT))
            self.assertIsNone(re.search(r'\son[a-z]+\s*=', source, re.IGNORECASE), rel)
            self.assertNotIn('type="importmap"', source, rel)
            self.assertNotIn('cdn.jsdelivr.net/npm/three', source, rel)
            for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script\s*>', source, re.IGNORECASE | re.DOTALL):
                if re.search(r'\bsrc\s*=', attrs, re.IGNORECASE):
                    continue
                script_type = re.search(r'\btype=["\']([^"\']+)', attrs, re.IGNORECASE)
                if script_type and script_type.group(1).lower() == 'application/ld+json':
                    continue
                self.assertFalse(body.strip(), f'{rel}: executable inline script remains')

    def test_year_script_is_external_and_only_loaded_where_needed(self):
        year_pages = []
        for html in deployed_html():
            source = html.read_text(encoding='utf-8', errors='replace')
            rel = str(html.relative_to(ROOT))
            self.assertNotIn('document.write(new Date().getFullYear())', source, rel)
            if 'data-current-year' in source:
                year_pages.append(rel)
                prefix = '../' if html.parent.name == 'admin' else ''
                self.assertIn(f'<script src="{prefix}js/currentYear.js"></script>', source, rel)
        self.assertTrue(year_pages)
        current_year = (ROOT / 'js' / 'currentYear.js').read_text(encoding='utf-8')
        self.assertIn("querySelectorAll('[data-current-year]')", current_year)
        self.assertIn('new Date().getFullYear()', current_year)

    def test_maintenance_gate_verifies_vendor_hashes_and_forbidden_dependencies(self):
        module = load_maintenance_module()
        self.assertEqual(module.check_vendor_integrity(), [])
        self.assertEqual(module.check_html_security_policy(), [])
        expected = {
            'js/vendor/dompurify-3.4.15.min.js': 'f263b05369e050fa175d4ecb9c9358eb4253602d510297adfb31df48b2f1c4d5',
            'js/vendor/marked-18.0.11.min.js': '69451c8541c9c1e7a4bf3ffc6f73c4d89633de92bfbe3e484dfe182ef8091f88',
        }
        self.assertEqual(module.VENDOR_SHA256, expected)
        self.assertEqual(module.ALLOWED_JSDELIVR_URLS, ALLOWED_JSDELIVR_URLS)
        with patch.object(module, 'VENDOR_SHA256', {'js/vendor/dompurify-3.4.15.min.js': '0' * 64}):
            self.assertIn(
                'vendor hash mismatch: js/vendor/dompurify-3.4.15.min.js',
                module.check_vendor_integrity(),
            )
        maintenance_source = (ROOT / 'scripts' / 'maintenance_check.py').read_text(encoding='utf-8')
        self.assertIn('vendor_errors = check_vendor_integrity()', maintenance_source)
        self.assertIn('security_policy_errors = check_html_security_policy()', maintenance_source)
        self.assertIn('"vendor_errors": vendor_errors[:50]', maintenance_source)
        self.assertIn('"security_policy_errors": security_policy_errors[:50]', maintenance_source)
        self.assertIn('not vendor_errors', maintenance_source)
        self.assertIn('not security_policy_errors', maintenance_source)

    def test_no_unapproved_remote_stylesheet_dependency_remains(self):
        style = (ROOT / 'style.css').read_text(encoding='utf-8')
        self.assertNotIn('cdn.jsdelivr.net', style)
        unused_styles = (
            'css/animate.css',
            'css/owl.carousel.css',
            'css/magnific-popup.css',
            'css/font-awesome.min.css',
            'css/themify-icons.css',
        )
        for relative in unused_styles:
            self.assertNotIn(f'@import url({relative})', style)
            self.assertFalse((ROOT / relative).exists(), relative)
        scss = (ROOT / 'scss' / 'style.scss').read_text(encoding='utf-8')
        self.assertNotIn('fonts.googleapis.com', scss)
        for relative in unused_styles:
            self.assertNotIn(relative, scss)

    def test_vendor_gate_rejects_protocol_relative_jsdelivr_urls(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            (temp_root / 'js').mkdir()
            (temp_root / 'js' / 'unexpected.js').write_text(
                "import '//cdn.jsdelivr.net/npm/unapproved@1/index.js';",
                encoding='utf-8',
            )
            with patch.object(module, 'REPO', temp_root), patch.object(module, 'VENDOR_SHA256', {}):
                errors = module.check_vendor_integrity()
        self.assertTrue(any('jsDelivr' in error for error in errors), errors)

    def test_csp_gate_detects_uppercase_script_before_policy(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            marker = f'<meta http-equiv="Content-Security-Policy" content="{module.PUBLIC_CSP}">'
            (temp_root / 'probe.html').write_text(
                '<html><head><SCRIPT src="before.js"></SCRIPT>'
                + marker
                + '<meta name="referrer" content="strict-origin-when-cross-origin"></head></html>',
                encoding='utf-8',
            )
            with patch.object(module, 'REPO', temp_root):
                errors = module.check_html_security_policy()
        self.assertTrue(any('CSP appears after a script' in error for error in errors), errors)

    def test_csp_gate_rejects_policy_outside_head(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            marker = f'<meta http-equiv="Content-Security-Policy" content="{module.PUBLIC_CSP}">'
            (temp_root / 'probe.html').write_text(
                '<html><head><meta name="referrer" content="strict-origin-when-cross-origin"></head>'
                '<body>' + marker + '</body></html>',
                encoding='utf-8',
            )
            with patch.object(module, 'REPO', temp_root):
                errors = module.check_html_security_policy()
        self.assertTrue(any('CSP must be inside head' in error for error in errors), errors)

    def test_vendor_gate_rejects_recreated_obsolete_files_and_js_imports(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            (temp_root / 'js').mkdir()
            (temp_root / 'js' / 'active.js').write_text('/* obsolete */', encoding='utf-8')
            (temp_root / 'js' / 'app.js').write_text(
                "import './plugins.js'; const cdn = 'https://cdn.' + 'jsdelivr.net/npm/unapproved@1/x.js';",
                encoding='utf-8',
            )
            with patch.object(module, 'REPO', temp_root), patch.object(module, 'VENDOR_SHA256', {}):
                errors = module.check_vendor_integrity()
        self.assertTrue(any('forbidden dependency file' in error for error in errors), errors)
        self.assertTrue(any('forbidden dependency reference' in error for error in errors), errors)
        self.assertTrue(any('constructed jsDelivr' in error for error in errors), errors)

    def test_policy_gate_rejects_policy_after_external_resource(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            csp = f'<meta http-equiv="Content-Security-Policy" content="{module.PUBLIC_CSP}">'
            referrer = '<meta name="referrer" content="strict-origin-when-cross-origin">'
            (temp_root / 'probe.html').write_text(
                '<html><head><link rel="stylesheet" href="style.css">'
                + csp + referrer + '</head></html>',
                encoding='utf-8',
            )
            with patch.object(module, 'REPO', temp_root):
                errors = module.check_html_security_policy()
        self.assertTrue(any('CSP appears after an external resource' in error for error in errors), errors)
        self.assertTrue(any('referrer policy appears after an external resource' in error for error in errors), errors)

    def test_policy_gate_rejects_late_charset(self):
        module = load_maintenance_module()
        with tempfile.TemporaryDirectory() as directory:
            temp_root = Path(directory)
            csp = f'<meta http-equiv="Content-Security-Policy" content="{module.PUBLIC_CSP}">'
            referrer = '<meta name="referrer" content="strict-origin-when-cross-origin">'
            source = '<html><head>' + (' ' * 1100) + '<meta charset="UTF-8">' + csp + referrer + '</head></html>'
            (temp_root / 'probe.html').write_text(source, encoding='utf-8')
            with patch.object(module, 'REPO', temp_root):
                errors = module.check_html_security_policy()
        self.assertTrue(any('charset declaration is too late' in error for error in errors), errors)


if __name__ == '__main__':
    unittest.main()
