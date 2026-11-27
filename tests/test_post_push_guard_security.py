import io
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from unittest import mock

from scripts import post_push_guard


EXPECTED = "a" * 40
OTHER = "b" * 40


class PostPushRollbackSafetyTests(unittest.TestCase):
    def test_full_suite_has_operational_timeout_budget_without_changing_scoped_budget(self):
        with mock.patch.dict(post_push_guard.os.environ, {}, clear=True):
            full_commands = post_push_guard.local_verification_commands()
        with mock.patch.dict(post_push_guard.os.environ, {"LOTTEREAL_PUBLIC_CONTENT_ONLY": "1"}, clear=True):
            scoped_commands = post_push_guard.local_verification_commands()

        self.assertEqual(600, full_commands[0][1])
        self.assertEqual(180, scoped_commands[0][1])

    def test_timeout_becomes_sanitized_failure_and_triggers_rollback(self):
        credential = "github_pat_must_not_escape"
        expected_failure = {
            "check": "unittest",
            "exit_code": 124,
            "output_tail": "command timed out after 600 seconds",
        }
        completed_revision = subprocess.CompletedProcess(
            ["git", "rev-parse", "HEAD"], 0, stdout=EXPECTED + "\n", stderr=""
        )
        timeout = subprocess.TimeoutExpired(
            ["python", "-m", "unittest", credential],
            600,
            output=credential,
            stderr=f"credential={credential}",
        )

        stdout = io.StringIO()
        with (
            mock.patch.object(sys, "argv", ["post_push_guard.py", "--wait-seconds", "0"]),
            mock.patch.object(post_push_guard, "load_env", return_value={"GITHUB_TOKEN": credential}),
            mock.patch.object(post_push_guard, "fetch_live_config", return_value=(200, "safe", None)),
            mock.patch.object(
                post_push_guard,
                "local_verification_commands",
                return_value=[(["python", "-m", "unittest", credential], 600, "unittest")],
            ),
            mock.patch.object(post_push_guard.subprocess, "run", side_effect=[completed_revision, timeout]),
            mock.patch.object(
                post_push_guard,
                "rollback",
                return_value={"rolled_back": True},
            ) as rollback,
            redirect_stdout(stdout),
        ):
            exit_code = post_push_guard.main()

        self.assertEqual(1, exit_code)
        rollback.assert_called_once_with([expected_failure], {"GITHUB_TOKEN": credential}, EXPECTED)
        rendered = stdout.getvalue()
        self.assertNotIn(credential, rendered)
        self.assertNotIn("TimeoutExpired", rendered)
        self.assertIn("command timed out after 600 seconds", rendered)

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
