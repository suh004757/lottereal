import unittest
from unittest import mock

from scripts import post_push_guard


EXPECTED = "a" * 40
OTHER = "b" * 40


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


if __name__ == "__main__":
    unittest.main()
