from __future__ import annotations

import unittest

from rvagent_crossfile_fixture.auth_service import AuthService
from rvagent_crossfile_fixture.models import User, UserRepository
from rvagent_crossfile_fixture.notifier import InMemoryNotifier
from rvagent_crossfile_fixture.token_store import OneTimeTokenStore


class AuthFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = 1_700_000_000.0
        self.users = UserRepository(
            [
                User("alice", "Alice@example.test"),
                User("bob", "bob@example.test"),
            ]
        )
        # Production uses the store's default monotonic clock. A fixed clock
        # keeps this unit test deterministic.
        self.tokens = OneTimeTokenStore(clock=lambda: self.now)
        self.notifier = InMemoryNotifier(clock=lambda: self.now)
        self.service = AuthService(
            users=self.users,
            tokens=self.tokens,
            notifier=self.notifier,
            clock=lambda: self.now,
        )

    def test_request_returns_a_usable_raw_token(self) -> None:
        raw_token = self.service.request_login_link("Alice@example.test")
        self.assertIsNotNone(raw_token)
        assert raw_token is not None
        self.assertTrue(
            self.service.login_with_token(
                email="Alice@example.test",
                raw_token=raw_token,
            )
        )

    def test_token_is_one_time_for_the_happy_path(self) -> None:
        raw_token = self.service.request_login_link("bob@example.test")
        assert raw_token is not None
        self.assertTrue(
            self.service.login_with_token(
                email="bob@example.test",
                raw_token=raw_token,
            )
        )
        self.assertFalse(
            self.service.login_with_token(
                email="bob@example.test",
                raw_token=raw_token,
            )
        )

    def test_notification_is_recorded(self) -> None:
        self.service.request_login_link("bob@example.test")
        self.assertEqual(1, len(self.notifier.messages))
        self.assertIn("token=", self.notifier.messages[0].url)


if __name__ == "__main__":
    unittest.main()
