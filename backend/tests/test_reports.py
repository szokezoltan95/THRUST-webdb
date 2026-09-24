from datetime import datetime, timezone
import math

import pytest

from app.api.reports import _metric_map, _trend_data
from app.models import Measurement, Participant, ParticipantGroup


def test_metric_map_reads_simple_and_scope_metrics_and_ignores_non_finite():
    result = _metric_map({
        "metrics": {"simple_error": 1.25, "bad": math.nan, "flag": True},
        "normalized_step_response": {"channels": {
            "AILE": {"metrics": {"rise_time_s": 0.4, "step_count": 5}},
            "ELEV": {"metrics": {"overshoot_pct": 3.0}},
        }},
    })
    assert result == {"simple_error": 1.25, "AILE.rise_time_s": 0.4,
                      "AILE.step_count": 5.0, "ELEV.overshoot_pct": 3.0}


class _Scalars:
    def __init__(self, items):
        self.items = items

    def __iter__(self):
        return iter(self.items)


class _FakeDB:
    def __init__(self, groups, participants, measurements):
        self.groups, self.participants, self.measurements = groups, participants, measurements

    async def scalars(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is ParticipantGroup:
            return _Scalars(self.groups)
        if entity is Participant:
            return _Scalars(self.participants)
        if entity is Measurement:
            return _Scalars(self.measurements)
        raise AssertionError(entity)


@pytest.mark.asyncio
async def test_group_trends_return_member_mean_and_individual_series():
    p1 = Participant(id="p1", participant_code="AAAAA")
    p2 = Participant(id="p2", participant_code="BBBBB")
    group = ParticipantGroup(id="g1", name="Cohort", members=[p1, p2])
    when = datetime(2026, 1, 5, tzinfo=timezone.utc)
    rows = [
        Measurement(id="m1", participant_id="p1", test_type="Scope v1", status="completed", started_at=when,
                    analysis_data={"metrics": {"score": 2}}),
        Measurement(id="m2", participant_id="p2", test_type="Scope v1", status="completed", started_at=when,
                    analysis_data={"metrics": {"score": 4}}),
    ]
    db = _FakeDB([group], [p1], rows)
    result = await _trend_data(db, ["p1"], ["g1"], "score", "date", None, None)
    by_name = {series["subject"]: series for series in result["series"]}
    assert by_name["AAAAA"]["points"][0]["mean"] == 2
    assert by_name["Cohort"]["points"][0]["mean"] == 3
    assert by_name["Cohort"]["points"][0]["participant_count"] == 2
    assert by_name["Cohort"]["points"][0]["measurement_count"] == 2
