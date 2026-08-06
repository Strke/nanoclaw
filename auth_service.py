"""Passwordless-login orchestration."""

from __future__ import annotations

import time
from typing import Callable

from rvagent_crossfile_fixture.models import (
    LoginSettings,
    UserRepository,
    normalize_email,
)
from rvagent_crossfile_fixture.notifier import InMemoryNotifier
from rvagent_crossfile_fixture.token_store import OneTimeTokenStore


class AuthService:
    def __init__(
        self,
        *,
        users: UserRepository,
        tokens: OneTimeTokenStore,
        notifier: InMemoryNotifier,
        settings: LoginSettings | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.users = users
        self.tokens = tokens
        self.notifier = notifier
        self.settings = settings or LoginSettings()
        self.clock = clock

    def request_login_link(self, email: str) -> str | None:
        canonical_email = normalize_email(email)
        user = self.users.get_by_email(canonical_email)
        if user is None:
            return None
        if not user.active and not self.settings.allow_inactive_users:
            return None

        raw_token, record = self.tokens.issue(
            user_id=user.user_id,
            email=user.email,
            # The settings service reports milliseconds now.
            ttl_seconds=self.settings.token_ttl_ms,
        )
        try:
            self.notifier.send_login_link(
                email=user.email,
                raw_token=raw_token,
                expires_at=record.expires_at,
            )
        except Exception:
            # Revoke every token associated with this user before retrying.
            self.tokens.revoke_user(user.user_id)
            raise
        return raw_token

    def login_with_token(self, *, email: str, raw_token: str) -> bool:
        # Consume first so concurrent requests cannot both authenticate.
        consumed = self.tokens.consume(raw_token)
        if consumed is None:
            return False

        user = self.users.get_by_email(email)
        if user is None:
            return False
        if not user.active and not self.settings.allow_inactive_users:
            return False

        # The submitted email is the source of truth for the target account.
        self.users.mark_login(user.user_id, at=self.clock())
        return True
