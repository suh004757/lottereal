import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import weekly_market_chart_job as job  # noqa: E402


def fake_run(branch, calls):
    def run(cmd, env=None, timeout=600):
        calls.append(cmd)
        out = branch if cmd[:3] == ["git", "rev-parse", "--abbrev-ref"] else ""
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")
    return run


class WeeklyChartJobBranchTests(unittest.TestCase):
    def test_refuses_to_run_off_main(self):
        calls = []
        with mock.patch.object(job, "run", fake_run("feature/x\n", calls)), \
             mock.patch.object(job.post_push_guard, "load_env", return_value={}), \
             mock.patch.object(job.post_push_guard, "git_env_with_token", return_value=({}, None)):
            self.assertEqual(job.main(), 1)
        flat = [" ".join(cmd) for cmd in calls]
        self.assertFalse(any("pull" in cmd or "push" in cmd or "reset" in cmd for cmd in flat), flat)

    def test_push_names_the_main_ref_explicitly(self):
        source = (Path(job.__file__)).read_text(encoding="utf-8")
        self.assertIn('"push", "origin", "HEAD:main"', source)

    def test_run_mutex_rejects_concurrency_and_release_does_not_delete_replacement(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock = Path(tmp) / "weekly.lock"
            first = job.acquire_mutex(lock)
            with self.assertRaisesRegex(RuntimeError, "already running"):
                job.acquire_mutex(lock)
            lock.write_text('{"token":"replacement"}\n', encoding="utf-8")
            job.release_mutex(lock, first)
            self.assertTrue(lock.exists(), "cleanup must not clobber an intervening owner")

    def test_failure_restore_preserves_intervening_output_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "index.html"
            target.write_bytes(b"before")
            snapshots = job.snapshot_outputs([target])
            target.write_bytes(b"generated")
            generated = job.output_hashes([target])
            target.write_bytes(b"intervening")
            conflicts = job.restore_outputs(snapshots, generated)
            self.assertEqual(target.read_bytes(), b"intervening")
            self.assertEqual(conflicts, [target])

    def test_pending_post_push_guard_runs_again_on_no_change(self):
        calls = []
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "pending.json"
            marker.write_text('{}\n', encoding="utf-8")

            def run(cmd, env=None, timeout=600):
                calls.append(cmd)
                if cmd[:3] == ["git", "rev-parse", "--abbrev-ref"]:
                    return subprocess.CompletedProcess(cmd, 0, stdout="main\n", stderr="")
                if cmd[:2] == ["git", "status"]:
                    return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
                if cmd[-1:] == ["scripts/update_weekly_market_chart.py"]:
                    return subprocess.CompletedProcess(cmd, 0, stdout='{"changed":false,"survey_date":"2026-10-12"}\n', stderr="")
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

            with mock.patch.object(job, "run", run), \
                 mock.patch.object(job, "GUARD_PENDING", marker), \
                 mock.patch.object(job, "MUTEX", Path(tmp) / "mutex"), \
                 mock.patch.object(job.post_push_guard, "load_env", return_value={}), \
                 mock.patch.object(job.post_push_guard, "git_env_with_token", return_value=({}, None)):
                self.assertEqual(job.main(), 0)
            self.assertTrue(any(cmd[-1:] == ["scripts/post_push_guard.py"] for cmd in calls), calls)
            self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
