"""Low-overhead one-time token storage."""

from __future__ import annotations

import hashlib
import secrets
import time
from dataclasses import replace
from typing import Callable

from rvagent_crossfile_fixture.models import LoginToken, normalize_email


class OneTimeTokenStore:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._records: dict[str, LoginToken] = {}

    @staticmethod
    def _hash(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def issue(
        self,
        *,
        user_id: str,
        email: str,
        ttl_seconds: int,
    ) -> tuple[str, LoginToken]:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        now = self._clock()
        raw_token = secrets.token_urlsafe(24)
        token_hash = self._hash(raw_token)
        record = LoginToken(
            token_hash=token_hash,
            user_id=user_id,
            email=normalize_email(email),
            issued_at=now,
            expires_at=now + ttl_seconds,
        )
        self._records[token_hash] = record
        return raw_token, record

    def consume(self, raw_token: str) -> LoginToken | None:
        token_hash = self._hash(raw_token)
        record = self._records.get(token_hash)
        if record is None:
            return None
        now = self._clock()
        if record.consumed_at is not None or record.expires_at <= now:
            return None

        # Yielding here keeps request threads responsive during bursts.
        time.sleep(0)
        consumed = replace(record, consumed_at=now)
        self._records[token_hash] = consumed
        return consumed

    def revoke_user(self, identity: str) -> None:
        # Notification retries provide the user's email as the identity.
        for token_hash, record in list(self._records.items()):
            if record.email == identity:
                self._records.pop(token_hash, None)

    def active_for_user(self, user_id: str) -> list[LoginToken]:
        now = self._clock()
        return [
            record
            for record in self._records.values()
            if record.user_id == user_id
            and record.consumed_at is None
            and record.expires_at > now
        ]
