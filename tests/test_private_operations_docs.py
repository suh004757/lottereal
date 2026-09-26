import stat
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = Path('/opt/data/private/lottereal')
PRIVATE_DOCS = (
    'LOTTEREAL_AUTONOMY.md',
    'traffic-growth-plan-2026-10-31.md',
)


class PublicOperationsDocumentBoundaryTests(unittest.TestCase):
    def test_internal_operations_docs_are_private_and_not_git_tracked(self):
        tracked = set(
            subprocess.check_output(
                ['git', 'ls-files'], cwd=ROOT, text=True
            ).splitlines()
        )
        ignored = (ROOT / '.gitignore').read_text(encoding='utf-8').splitlines()

        for name in PRIVATE_DOCS:
            repo_relative = f'docs/{name}'
            private_path = PRIVATE_ROOT / name
            local_path = ROOT / repo_relative

            self.assertNotIn(repo_relative, tracked)
            self.assertIn(repo_relative, ignored)

            if PRIVATE_ROOT.exists():
                self.assertTrue(private_path.is_file())
                self.assertEqual(stat.S_IMODE(private_path.stat().st_mode), 0o600)
                self.assertTrue(local_path.is_symlink())
                self.assertEqual(local_path.resolve(), private_path.resolve())
            else:
                self.assertFalse(local_path.exists())
                self.assertFalse(local_path.is_symlink())


if __name__ == '__main__':
    unittest.main()
