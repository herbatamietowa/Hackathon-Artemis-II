"""Test Agent 1 contract invariants."""
import pytest
from app.agents.contracts import ContractError, KNOWN_WC_CODES, validate_agent1_payload


VALID = {
    "scenario": "100_pct",
    "factory": "NW01",
    "period": "5 2026",
    "capacity_utilization": 0.87,
    "available_hours": 1240.0,
    "demanded_hours": 1078.8,
    "bottleneck_detected": True,
    "bottleneck_work_centers": ["PRESS_3"],
    "oee_applied": 0.82,
    "excluded_rows": 0,
    "flag_count": 2,
    "reconstructed_rows": 1,
    "reasoning": "All good.",
}


def test_valid_payload_passes():
    KNOWN_WC_CODES.add("PRESS_3")
    validate_agent1_payload(VALID)


def test_missing_field_raises():
    bad = {k: v for k, v in VALID.items() if k != "reasoning"}
    with pytest.raises(ContractError, match="reasoning"):
        validate_agent1_payload(bad)


def test_negative_utilization_raises():
    bad = {**VALID, "capacity_utilization": -0.1}
    with pytest.raises(ContractError):
        validate_agent1_payload(bad)


def test_oee_out_of_range_raises():
    bad = {**VALID, "oee_applied": 1.5}
    with pytest.raises(ContractError):
        validate_agent1_payload(bad)


def test_bottleneck_flag_inconsistency_raises():
    bad = {**VALID, "bottleneck_detected": False, "bottleneck_work_centers": ["PRESS_3"]}
    with pytest.raises(ContractError, match="inconsistent"):
        validate_agent1_payload(bad)


def test_unknown_wc_raises():
    KNOWN_WC_CODES.clear()
    KNOWN_WC_CODES.add("PRESS_3")
    bad = {**VALID, "bottleneck_work_centers": ["UNKNOWN_WC"]}
    with pytest.raises(ContractError, match="Unknown WC"):
        validate_agent1_payload(bad)


def test_overloaded_utilization_above_2_does_not_raise(caplog):
    """Utilization > 2.0 should log WARNING but not raise (overloaded factory)."""
    import logging
    payload = {**VALID, "capacity_utilization": 2.5}
    with caplog.at_level(logging.WARNING):
        validate_agent1_payload(payload)
    assert any("2.0" in r.message for r in caplog.records)
