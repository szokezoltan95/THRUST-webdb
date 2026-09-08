import hashlib
import secrets

from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

PARTICIPANT_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_hex(32)


def new_participant_code() -> str:
    groups = [
        "".join(secrets.choice(PARTICIPANT_ALPHABET) for _ in range(4))
        for _ in range(3)
    ]
    return "-".join(groups)

