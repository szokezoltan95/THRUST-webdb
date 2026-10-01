from types import SimpleNamespace

import pytest

from app.api.welcome import _aggregate_metric, _featured_comparison, _is_legacy_default
from app.api.student import histogram
from app.core.config import settings


def _measurement(participant_id: str, reaction: float, *, second_axis: float | None = None):
    axes = {"LX": {"metrics": {"reaction_delay_s": reaction}, "mean": [0.0, reaction, 1.0]}}
    if second_axis is not None:
        axes["LY"] = {"metrics": {"reaction_delay_s": second_axis}, "mean": [0.0, second_axis, 1.0]}
    return SimpleNamespace(
        participant_id=participant_id, test_definition_id="scope-1", test_type="SCoPE",
        analysis_data={"normalized_step_response": {"channels": axes}},
    )


def test_public_comparison_uses_student_histogram_without_own_value(monkeypatch):
    monkeypatch.setattr(settings, "public_min_group_size", 3)
    tests = {"scope-1": SimpleNamespace(analysis_profile="SCOPE_STEP_RESPONSE_V1")}
    rows = [
        _measurement("p1", 0.2, second_axis=0.4),
        _measurement("p1", 0.3, second_axis=0.5),
        _measurement("p2", 0.6),
        _measurement("p3", 0.8),
    ]
    block = {"mode": "SCOPE", "metrics": ["reaction_delay_s"], "bins": 3, "show_response": True}

    result = _featured_comparison(rows, tests, block)

    # p1 contributes (0.3 + 0.4) / 2 = 0.35, then each of the three
    # participants has one vote in the displayed group mean.
    assert result["metrics"][0]["cohort_average"] == pytest.approx((0.35 + 0.6 + 0.8) / 3)
    assert result["participant_count"] == 3
    assert result["response_curve"] is not None
    assert result["metrics"][0]["histogram"]["counts"] == histogram([0.35, 0.6, 0.8], None, 3)["counts"]
    assert result["metrics"][0]["histogram"]["minimum"] == pytest.approx(0.35)
    assert result["metrics"][0]["histogram"]["own_value"] is None
    assert "p1" not in str(result) and "p2" not in str(result)


def test_public_comparison_hides_data_below_cohort_minimum(monkeypatch):
    monkeypatch.setattr(settings, "public_min_group_size", 3)
    tests = {"scope-1": SimpleNamespace(analysis_profile="SCOPE_STEP_RESPONSE_V1")}
    block = {"mode": "SCOPE", "metrics": ["reaction_delay_s"], "bins": 8, "show_response": True}

    result = _featured_comparison([_measurement("p1", 0.2), _measurement("p2", 0.4)], tests, block)

    assert result["available"] is False
    assert result["participant_count"] is None
    assert result["metrics"][0]["cohort_average"] is None
    assert result["metrics"][0]["histogram"] is None
    assert result["response_curve"] is None


def test_public_aggregate_weights_people_equally_and_checks_minimum(monkeypatch):
    monkeypatch.setattr(settings, "public_min_group_size", 3)
    tests = {"scope-1": SimpleNamespace(analysis_profile="SCOPE_STEP_RESPONSE_V1")}
    rows = [_measurement("p1", 0.2), _measurement("p1", 0.4), _measurement("p2", 0.6), _measurement("p3", 0.9)]
    spec = {"mode": "SCOPE", "metric": "reaction_delay_s"}

    assert _aggregate_metric(rows, tests, spec) == pytest.approx((0.3 + 0.6 + 0.9) / 3)
    assert _aggregate_metric(rows[:3], tests, spec) is None


def test_only_original_untouched_home_page_is_replaced_by_new_default():
    blocks = [
        {"id": "eyebrow", "type": "eyebrow", "text": "LETECKÁ FAKULTA TUKE · VÝSKUM RIADENIA UAV"},
        {"id": "intro", "type": "heading", "text": "Za každým letom je človek."},
        {"id": "lead", "type": "text", "text": "THRUST skúma, ako piloti reagujú a ovládajú dron. Spája meranie, analýzu a porovnávanie výsledkov, aby sme ľudskému výkonu pri riadení UAV lepšie rozumeli."},
        {"id": "tagline", "type": "banner", "title": "Od prvého pohybu ovládača až po zmeny výkonu v čase.", "body": ""},
        {"id": "numbers", "type": "metrics", "items": ["participants", "measurements", "active_tests"], "trends": []},
    ]

    assert _is_legacy_default(blocks, "sk")
    blocks[1]["text"] = "Vlastný nadpis"
    assert not _is_legacy_default(blocks, "sk")
