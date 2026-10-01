from types import SimpleNamespace

import pytest

from app.api.welcome import _featured_comparison, _is_legacy_default, _private_distribution
from app.core.config import settings


def _measurement(participant_id: str, reaction: float, *, second_axis: float | None = None):
    axes = {"LX": {"metrics": {"reaction_delay_s": reaction}, "mean": [0.0, reaction, 1.0]}}
    if second_axis is not None:
        axes["LY"] = {"metrics": {"reaction_delay_s": second_axis}, "mean": [0.0, second_axis, 1.0]}
    return SimpleNamespace(
        participant_id=participant_id, test_definition_id="scope-1", test_type="SCoPE",
        analysis_data={"normalized_step_response": {"channels": axes}},
    )


def test_public_comparison_weights_people_equally_and_suppresses_small_bins(monkeypatch):
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
    assert sum(bin_item["count"] or 0 for bin_item in result["metrics"][0]["bins"]) == 3
    assert all(bin_item["count"] in (0, None) or bin_item["count"] >= 3 for bin_item in result["metrics"][0]["bins"])
    assert "p1" not in str(result) and "p2" not in str(result)


def test_public_comparison_hides_data_below_cohort_minimum(monkeypatch):
    monkeypatch.setattr(settings, "public_min_group_size", 3)
    tests = {"scope-1": SimpleNamespace(analysis_profile="SCOPE_STEP_RESPONSE_V1")}
    block = {"mode": "SCOPE", "metrics": ["reaction_delay_s"], "bins": 8, "show_response": True}

    result = _featured_comparison([_measurement("p1", 0.2), _measurement("p2", 0.4)], tests, block)

    assert result["available"] is False
    assert result["participant_count"] is None
    assert result["metrics"][0]["cohort_average"] is None
    assert result["metrics"][0]["bins"] == []
    assert result["response_curve"] is None


def test_distribution_uses_several_private_ranges_for_fifteen_people():
    # A fixed-width split can leave a small tail and collapse these into one bar.
    values = [0.23 + index * 0.005 for index in range(12)] + [0.32, 0.34, 0.37]

    bins = _private_distribution(values, requested_bins=8, minimum=5)

    assert len(bins) == 3
    assert [item["count"] for item in bins] == [5, 5, 5]
    assert all(bins[index]["end"] == bins[index + 1]["start"] for index in range(2))


def test_distribution_does_not_split_identical_values():
    bins = _private_distribution([0.2] * 7 + [0.4] * 8, requested_bins=8, minimum=5)

    assert [item["count"] for item in bins] == [7, 8]


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
