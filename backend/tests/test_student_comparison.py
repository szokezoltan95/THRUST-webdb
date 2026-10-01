import pytest

from app.api.student import comparison_metrics, comparison_response_curve, histogram


def test_scope_comparison_averages_metric_over_all_axes():
    analysis = {
        "normalized_step_response": {
            "channels": {
                "LX": {"metrics": {"reaction_delay_s": 0.2, "step_count": 8}},
                "LY": {"metrics": {"reaction_delay_s": 0.4, "step_count": 7}},
                "RY": {"metrics": {"reaction_delay_s": 0.3, "step_count": 9}},
                "RX": {"metrics": {"reaction_delay_s": 0.5, "step_count": 8}},
            }
        }
    }

    result = comparison_metrics(analysis, "SCOPE")

    assert result == {"reaction_delay_s": pytest.approx(0.35)}
    assert not any(axis in key for key in result for axis in ("LX", "LY", "RY", "RX"))


def test_simple_comparison_includes_axis_aggregates_and_readable_summary_metrics():
    analysis = {
        "metrics": {
            "simple_mean_target_error_m": 1.25,
            "simple_in_zone_fraction": 0.8,
            "sample_count": 500,
        },
        "normalized_step_response": {
            "channels": {
                "x": {"metrics": {"rise_time_s": 0.2}},
                "y": {"metrics": {"rise_time_s": 0.4}},
            }
        },
    }

    result = comparison_metrics(analysis, "SIMPLE")

    assert result["rise_time_s"] == pytest.approx(0.3)
    assert result["mean_target_error_m"] == pytest.approx(1.25)
    assert result["time_in_zone_pct"] == pytest.approx(80)
    assert "sample_count" not in result


def test_response_trace_combines_all_axes_and_histogram_returns_bins_not_subject_rows():
    analysis = {
        "normalized_step_response": {
            "channels": {
                "x": {"mean": [0.0, 0.5, 1.0]},
                "y": {"mean": [0.0, 1.0, 1.0]},
            }
        }
    }

    curve = comparison_response_curve(analysis)
    distribution = histogram([1.0, 2.0, 3.0], own_value=2.0, bin_count=3)

    assert curve is not None
    assert curve[0] == pytest.approx(0.0)
    assert curve[30] == pytest.approx(0.75)
    assert curve[-1] == pytest.approx(1.0)
    assert distribution["counts"] == [1, 1, 1]
    assert distribution["own_value"] == 2.0
    assert "participants" not in distribution
