"""Offline CLI tests and portable execution of the production batch predicate."""
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/purge_platform_requests.py'


class PurgeCliTests(unittest.TestCase):
    def run_cli(self, *args, result='2', fail=False):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            psql = folder / 'psql'
            called = folder / 'called'
            psql.write_text(
                f'#!{sys.executable}\n'
                'from pathlib import Path\nimport sys\n'
                f'Path({str(called)!r}).write_text(" ".join(sys.argv[1:]) + "\\n" + sys.stdin.read())\n'
                f'print({result!r})\n'
                'print("synthetic private diagnostic", file=sys.stderr)\n'
                f'sys.exit({int(fail)})\n', encoding='utf-8',
            )
            psql.chmod(0o700)
            proc = subprocess.run(
                [sys.executable, '-B', str(SCRIPT), *args],
                env={'PATH': tmp}, capture_output=True, text=True, timeout=5,
            )
            return proc, called.read_text() if called.exists() else None

    def test_default_does_not_start_psql(self):
        self.assertTrue(SCRIPT.is_file(), 'retention CLI is missing')
        proc, called = self.run_cli()
        self.assertEqual((proc.returncode, proc.stdout, proc.stderr), (0, '0\n', ''))
        self.assertIsNone(called)

    def test_apply_requires_an_explicit_named_service(self):
        for args in (('--apply',), ('--apply', '--service', 'target host=other'),
                     ('--app', '--service', 'test'), ('--service', 'test')):
            with self.subTest(args=args):
                proc, called = self.run_cli(*args)
                self.assertNotEqual(proc.returncode, 0)
                self.assertIsNone(called)

    def test_apply_sends_one_transaction_and_prints_count_only(self):
        proc, called = self.run_cli('--apply', '--service', 'synthetic_test')
        self.assertEqual((proc.returncode, proc.stdout, proc.stderr), (0, '2\n', ''))
        self.assertIn('service=synthetic_test', called)
        self.assertIn('ON_ERROR_STOP=1', called)
        self.assertIn('begin;', called.lower())
        self.assertIn('commit;', called.lower())
        self.assertEqual(called.lower().count('update public.pf_listing_requests'), 1)

    def test_db_errors_and_bad_output_are_not_disclosed(self):
        for result, fail in (('synthetic private value', True), ('2', True),
                             ('synthetic private value', False), ('101', False)):
            with self.subTest(result=result, fail=fail):
                proc, called = self.run_cli('--apply', '--service', 'test', result=result, fail=fail)
                self.assertIsNotNone(called)
                self.assertEqual((proc.returncode, proc.stdout, proc.stderr),
                                 (1, '', 'Listing request retention failed.\n'))


class BatchSqlTests(unittest.TestCase):
    def test_boundary_keep_rows_and_metadata_and_repeat_in_bounded_batches(self):
        self.assertTrue(SCRIPT.is_file(), 'retention CLI is missing')
        spec = importlib.util.spec_from_file_location('purge_platform_requests', SCRIPT)
        script = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(script)
        # SQLite executes the actual selection and UPDATE. Replace only PostgreSQL
        # syntax for the clock, row locks, and wrapping the UPDATE in a count CTE.
        candidates, update = script.BATCH_SQL.split('with candidates', 1)[1].split('), redacted as (', 1)
        candidates = (candidates.replace('public.', '').replace('for update skip locked', '')
                      .replace("statement_timestamp() - interval '4320 hours'", ':cutoff'))
        update = update.split('returning 1', 1)[0].replace('public.', '')
        batch = 'with candidates' + candidates + ') ' + update + ' returning id'
        cutoff = '2026-01-01T00:00:00.000000Z'
        older = '2025-12-31T23:59:59.999999Z'
        newer = '2026-01-01T00:00:00.000001Z'
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('''create table pf_listing_requests (
            id integer primary key, status text, terminal_at text, created_at text, updated_at text,
            owner_name text, owner_phone text, description text, metric text)''')
        states = [(1, 'rejected', cutoff, 'fixture', None, None),
                  (2, 'published', older, None, None, 'fixture'),
                  (3, 'rejected', newer, 'fixture', None, None),
                  (4, 'published', None, 'fixture', None, None),
                  (5, 'new', None, 'fixture', None, None),
                  (6, 'reviewing', older, 'fixture', None, None),  # Untrusted timestamp must not override status.
                  (7, 'rejected', older, None, None, None)]
        states += [(i, 'rejected', cutoff, None, 'fixture', None) for i in range(8, 107)]
        db.executemany('insert into pf_listing_requests values (?, ?, ?, \'old\', \'unchanged\', ?, ?, ?, \'metric\')', states)
        first = {i for i, in db.execute(batch, {'cutoff': cutoff})}
        self.assertEqual(first, {1, 2, *range(8, 106)})
        self.assertEqual(db.execute(batch, {'cutoff': cutoff}).fetchall(), [(106,)])
        self.assertEqual(db.execute(batch, {'cutoff': cutoff}).fetchall(), [])
        expected = [(i, status, stamp, 'old', 'unchanged',
                     *((None, None, None) if i in first or i == 106 else (name, phone, desc)), 'metric')
                    for i, status, stamp, name, phone, desc in states]
        self.assertEqual(db.execute('select * from pf_listing_requests order by id').fetchall(), expected)
