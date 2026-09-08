from app.core.security import hash_password, new_participant_code, session_token_hash, verify_password


def test_password_round_trip() -> None:
    encoded = hash_password("a sufficiently long password")
    assert verify_password("a sufficiently long password", encoded)
    assert not verify_password("wrong password", encoded)


def test_participant_code_format_and_randomness() -> None:
    codes = {new_participant_code() for _ in range(100)}
    assert len(codes) == 100
    assert all(len(code) == 14 for code in codes)
    assert all(code.count("-") == 2 for code in codes)


def test_session_tokens_are_not_stored_verbatim() -> None:
    token = "secret-session-token"
    assert session_token_hash(token) != token
    assert len(session_token_hash(token)) == 64

