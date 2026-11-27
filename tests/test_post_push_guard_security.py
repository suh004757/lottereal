import io
import json
import subprocess
import unittest
from contextlib import redirect_stdout
from unittest import mock

from scripts import post_push_guard


EXPECTED = "a" * 40
OTHER = "b" * 40


class PostPushVerificationTimeoutTests(unittest.TestCase):
    def test_default_unittest_budget_covers_observed_full_suite_runtime(self):
        with mock.patch.dict(post_push_guard.os.environ, {"LOTTEREAL_PUBLIC_CONTENT_ONLY": "0"}):
            commands = post_push_guard.local_verification_commands()
        command, budget, _ = commands[0]
        self.assertIn("discover", command)
        self.assertGreaterEqual(budget, 300)

    def test_timeout_reaches_rollback_without_printing_command_or_partial_output(self):
        command = ["fixture-check", "synthetic-command-value"]
        error = subprocess.TimeoutExpired(command, 3, output=b"synthetic-stdout", stderr=b"synthetic-stderr")
        output = io.StringIO()
        with (
            mock.patch.object(post_push_guard.sys, "argv", ["post_push_guard.py"]),
            mock.patch.object(post_push_guard, "load_env", return_value={}),
            mock.patch.object(post_push_guard, "fetch_live_config", return_value=(200, "", None)),
            mock.patch.object(post_push_guard, "local_verification_commands", return_value=[(command, 3, "unittest")]),
            mock.patch.object(post_push_guard, "run", side_effect=[(0, EXPECTED), error]),
            mock.patch.object(post_push_guard, "rollback", return_value={"rolled_back": True}) as rollback,
            redirect_stdout(output),
        ):
            self.assertEqual(post_push_guard.main(), 1)
        failures = [{"check": "unittest", "exit_code": 124, "error": "timeout", "timeout_seconds": 3}]
        rollback.assert_called_once_with(failures, {}, EXPECTED)
        self.assertEqual(json.loads(output.getvalue())["failures"], failures)
        self.assertNotIn("synthetic-", output.getvalue())


class PostPushRollbackSafetyTests(unittest.TestCase):
    def test_refuses_rollback_when_local_head_is_not_failed_revision(self):
        calls = []

        def fake_run(cmd, **_kwargs):
            calls.append(cmd)
            if cmd == ["git", "fetch", "origin", "main"]:
                return 0, ""
            if cmd == ["git", "rev-parse", "HEAD"]:
                return 0, OTHER + "\n"
            raise AssertionError(cmd)

        with mock.patch.object(post_push_guard, "run", side_effect=fake_run):
            result = post_push_guard.rollback([], {}, EXPECTED)
        self.assertFalse(result["rolled_back"])
        self.assertEqual("revision_precondition", result["stage"])
        self.assertFalse(any(command[:2] == ["git", "revert"] for command in calls))

    def test_refuses_rollback_when_remote_main_advanced(self):
        calls = []

        def fake_run(cmd, **_kwargs):
            calls.append(cmd)
            if cmd == ["git", "fetch", "origin", "main"]:
                return 0, ""
            if cmd == ["git", "rev-parse", "HEAD"]:
                return 0, EXPECTED + "\n"
            if cmd == ["git", "rev-parse", "refs/remotes/origin/main"]:
                return 0, OTHER + "\n"
            raise AssertionError(cmd)

        with mock.patch.object(post_push_guard, "run", side_effect=fake_run):
            result = post_push_guard.rollback([], {}, EXPECTED)
        self.assertFalse(result["rolled_back"])
        self.assertEqual("revision_precondition", result["stage"])
        self.assertFalse(any(command[:2] == ["git", "revert"] for command in calls))

    def test_reverts_exact_failed_revision_and_pushes_with_force_with_lease(self):
        calls = []
        revert_head = "c" * 40

        def fake_run(cmd, **_kwargs):
            calls.append(cmd)
            if cmd == ["git", "fetch", "origin", "main"]:
                return 0, ""
            if cmd in (["git", "rev-parse", "HEAD"], ["git", "rev-parse", "refs/remotes/origin/main"]):
                return 0, EXPECTED + "\n"
            if cmd == ["git", "rev-list", "--parents", "-n", "1", EXPECTED]:
                return 0, EXPECTED + " " + OTHER + "\n"
            if cmd == ["git", "revert", "--no-edit", EXPECTED]:
                return 0, ""
            if cmd == ["git", "push", f"--force-with-lease=refs/heads/main:{EXPECTED}", "origin", "HEAD:main"]:
                return 0, ""
            if cmd == ["git", "rev-parse", "--short", "HEAD"]:
                return 0, revert_head[:7] + "\n"
            raise AssertionError(cmd)

        with mock.patch.object(post_push_guard, "run", side_effect=fake_run):
            result = post_push_guard.rollback([], {}, EXPECTED)
        self.assertTrue(result["rolled_back"])
        self.assertIn(["git", "revert", "--no-edit", EXPECTED], calls)
        self.assertIn(
            ["git", "push", f"--force-with-lease=refs/heads/main:{EXPECTED}", "origin", "HEAD:main"],
            calls,
        )

    def test_reverts_merge_commit_using_first_parent_as_mainline(self):
        calls = []
        first_parent = "c" * 40
        second_parent = "d" * 40
        revert_head = "e" * 40

        def fake_run(cmd, **_kwargs):
            calls.append(cmd)
            if cmd == ["git", "fetch", "origin", "main"]:
                return 0, ""
            if cmd in (["git", "rev-parse", "HEAD"], ["git", "rev-parse", "refs/remotes/origin/main"]):
                return 0, EXPECTED + "\n"
            if cmd == ["git", "rev-list", "--parents", "-n", "1", EXPECTED]:
                return 0, f"{EXPECTED} {first_parent} {second_parent}\n"
            if cmd == ["git", "revert", "--no-edit", "-m", "1", EXPECTED]:
                return 0, ""
            if cmd == ["git", "push", f"--force-with-lease=refs/heads/main:{EXPECTED}", "origin", "HEAD:main"]:
                return 0, ""
            if cmd == ["git", "rev-parse", "--short", "HEAD"]:
                return 0, revert_head[:7] + "\n"
            raise AssertionError(cmd)

        with mock.patch.object(post_push_guard, "run", side_effect=fake_run):
            result = post_push_guard.rollback([], {}, EXPECTED)
        self.assertTrue(result["rolled_back"])
        self.assertIn(["git", "revert", "--no-edit", "-m", "1", EXPECTED], calls)
        self.assertNotIn(["git", "revert", "--no-edit", EXPECTED], calls)


if __name__ == "__main__":
    unittest.main()
