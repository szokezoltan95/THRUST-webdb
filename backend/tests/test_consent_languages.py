from pydantic import ValidationError
import pytest

from app.core.consents import consent_texts, gdpr_consent_text, research_consent_text
from app.schemas.auth import RegistrationRequest, ResearcherRegistrationRequest


def test_consent_texts_have_matching_versions_and_two_languages() -> None:
    sk, en = consent_texts("sk"), consent_texts("en")
    for kind in ("research", "gdpr"):
        assert sk[kind]["version"] == en[kind]["version"]
        assert sk[kind]["text"] != en[kind]["text"]
    assert "Prevádzkovateľ:" in gdpr_consent_text("sk")
    assert "Controller:" in gdpr_consent_text("en")
    assert "Súhlasím" in research_consent_text("sk")
    assert "I consent" in research_consent_text("en")


def test_registration_accepts_only_known_consent_languages() -> None:
    payload = dict(email="user@example.com", password="long password", first_name="A", last_name="B",
                   research_consent=True, gdpr_consent=True)
    assert RegistrationRequest(**payload).consent_language == "sk"
    assert RegistrationRequest(**payload, consent_language="en").consent_language == "en"
    with pytest.raises(ValidationError):
        RegistrationRequest(**payload, consent_language="de")
    researcher = dict(email="user@example.com", password="long password", first_name="A", last_name="B",
                      registration_key="key", gdpr_consent=True)
    assert ResearcherRegistrationRequest(**researcher, consent_language="en").consent_language == "en"
