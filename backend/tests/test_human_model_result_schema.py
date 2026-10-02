import pytest
from pydantic import ValidationError

from app.schemas.human_model_result import ComputeQualityUpdate, HumanModelUpload


def payload():
    parameters = {"gain": 1., "t1_s": .08, "t2_s": .4, "t3_s": .1, "delay_s": .2}
    return {
        "source_raw_sha256": "a" * 64,
        "algorithm_version": "thrust-human-model/1.0",
        "stage": "full_fit",
        "settings": {"baseline_s": .1},
        "quality": {"status": "ready"},
        "channels": {"LX": {"status": "converged", "fit": {"parameters": parameters},
                            "recording": {"time_s": [0., .1],
                                          "observed_normalized": [0., .1],
                                          "model_normalized": [0., .09]}}},
    }


def test_human_model_requires_complete_axes_parameters_and_matched_curve_arrays():
    HumanModelUpload.model_validate(payload())
    bad = payload(); bad["channels"]["LX"]["fit"]["parameters"].pop("delay_s")
    with pytest.raises(ValidationError):
        HumanModelUpload.model_validate(bad)
    bad = payload(); bad["channels"]["LX"]["recording"]["model_normalized"].pop()
    with pytest.raises(ValidationError):
        HumanModelUpload.model_validate(bad)


def test_human_model_rejects_nonfinite_samples_and_invalid_stage():
    bad = payload(); bad["channels"]["LX"]["recording"]["model_normalized"][1] = float("nan")
    with pytest.raises(ValidationError):
        HumanModelUpload.model_validate(bad)
    bad = payload(); bad["stage"] = "quick_sweep"
    with pytest.raises(ValidationError):
        HumanModelUpload.model_validate(bad)


def test_quality_flags_are_separate_from_model_acceptance():
    assert ComputeQualityUpdate(status="questionable", reason="large baseline noise").reason
    with pytest.raises(ValidationError):
        ComputeQualityUpdate(status="model_rejected")
