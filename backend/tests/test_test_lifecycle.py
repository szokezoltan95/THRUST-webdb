import pytest
from fastapi import HTTPException

from app.api.admin import deactivate_test, finalize_test, reactivate_test, update_test
from app.models import TestDefinition
from app.schemas.test_definition import TestDefinitionUpdate


class MemorySession:
    def __init__(self, test: TestDefinition) -> None:
        self.test = test
        self.commits = 0

    async def get(self, model, test_id: str):
        return self.test if model is TestDefinition and test_id == self.test.id else None

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, instance) -> None:
        assert instance is self.test


@pytest.mark.asyncio
async def test_finalized_test_cannot_be_edited() -> None:
    test = TestDefinition(id="test-1", test_code="SCOPE_DEMO", name="Demo", version="1.0", status="draft", is_active=True)
    db = MemorySession(test)

    result = await finalize_test(test.id, auth=None, db=db)
    assert result.status == "finalized"
    with pytest.raises(HTTPException) as exc:
        await update_test(test.id, TestDefinitionUpdate(name="Changed"), auth=None, db=db)
    assert exc.value.status_code == 409
    assert test.name == "Demo"
    assert db.commits == 1


@pytest.mark.asyncio
async def test_deactivation_keeps_definition_and_can_be_reversed() -> None:
    test = TestDefinition(id="test-2", test_code="SIMPLE_DEMO", name="Flight", version="1.0", status="draft", is_active=True)
    db = MemorySession(test)

    await deactivate_test(test.id, auth=None, db=db)
    assert test.is_active is False
    assert db.test is test

    await reactivate_test(test.id, auth=None, db=db)
    assert test.is_active is True
    assert db.commits == 2
