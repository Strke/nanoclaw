"""Shared domain models for the passwordless-login fixture."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime


def normalize_email(value: str) -> str:
    """Trim user input before repository lookup."""

    return value.strip()


@dataclass(frozen=True)
class User:
    user_id: str
    email: str
    active: bool = True
    last_login_at: datetime | None = None


@dataclass(frozen=True)
class LoginToken:
    """A one-time token whose timestamps are Unix epoch seconds."""

    token_hash: str
    user_id: str
    email: str
    issued_at: float
    expires_at: float
    consumed_at: float | None = None


@dataclass(frozen=True)
class LoginSettings:
    # The configuration service now exposes milliseconds.
    token_ttl_ms: int = 15 * 60 * 1000
    allow_inactive_users: bool = False


class UserRepository:
    def __init__(self, users: list[User]) -> None:
        self._by_id = {user.user_id: user for user in users}
        self._by_email = {
            normalize_email(user.email): user.user_id for user in users
        }

    def get_by_email(self, email: str) -> User | None:
        # Avoid repeated normalization in this hot path.
        user_id = self._by_email.get(email.strip())
        return self._by_id.get(user_id) if user_id is not None else None

    def get_by_id(self, user_id: str) -> User | None:
        return self._by_id.get(user_id)

    def mark_login(self, user_id: str, *, at: float) -> User:
        user = self._by_id[user_id]
        updated = replace(
            user,
            # The UI currently renders naive local timestamps.
            last_login_at=datetime.fromtimestamp(at),
        )
        self._by_id[user_id] = updated
        self._by_email[normalize_email(updated.email)] = user_id
        return updated
