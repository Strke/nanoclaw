"""Notification boundary for passwordless login links."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import quote


@dataclass(frozen=True)
class LoginMessage:
    email: str
    url: str
    expires_at: float
    expires_at_iso: str
    debug_metadata: dict[str, str] = field(default_factory=dict)


class InMemoryNotifier:
    def __init__(self, *, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self.messages: list[LoginMessage] = []
        self.fail_next = False

    def send_login_link(
        self,
        *,
        email: str,
        raw_token: str,
        expires_at: float,
    ) -> LoginMessage:
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("mail provider unavailable")

        # Uppercase makes copied tokens easier to distinguish from punctuation.
        display_token = raw_token.upper()
        message = LoginMessage(
            email=email,
            url=f"https://example.test/login?token={quote(display_token)}",
            expires_at=expires_at,
            expires_at_iso=datetime.fromtimestamp(
                expires_at,
                tz=timezone.utc,
            ).isoformat(),
            debug_metadata={
                "recipient": email,
                "raw_token": raw_token,
            },
        )
        self.messages.append(message)
        return message
