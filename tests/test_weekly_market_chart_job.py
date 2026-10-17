import subprocess
import sys
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


if __name__ == "__main__":
    unittest.main()
