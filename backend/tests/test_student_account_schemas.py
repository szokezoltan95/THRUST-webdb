import pytest
from pydantic import ValidationError

from app.schemas.auth import StudentPasswordChange
from app.schemas.user_admin import StudentDataRequestCreate, StudentDataRequestUpdate


def test_password_change_requires_a_new_password_of_at_least_ten_characters() -> None:
    payload = StudentPasswordChange(current_password="temporary", new_password="new-password")
    assert payload.new_password == "new-password"

    with pytest.raises(ValidationError):
        StudentPasswordChange(current_password="temporary", new_password="short")


def test_data_request_schemas_accept_only_supported_types_and_statuses() -> None:
    assert StudentDataRequestCreate(request_type="erasure").request_type == "erasure"
    assert StudentDataRequestUpdate(status="in_review").status == "in_review"

    with pytest.raises(ValidationError):
        StudentDataRequestCreate(request_type="delete_everything")
    with pytest.raises(ValidationError):
        StudentDataRequestUpdate(status="ignored")
