"""Test that numeric guard triggers fallback when Anthropic returns mutated values."""
import json
from unittest.mock import MagicMock, patch

from app.agents.agent1_capacity import run_agent1
from app.api.schemas import CapacityPlanResult, WCLoad

_ENGINE_RESULT = CapacityPlanResult(
    scenario="100_pct",
    factory="NW01",
    period="5 2026",
    capacity_utilization=0.87,
    available_hours=1240.0,
    demanded_hours=1078.8,
    bottleneck_detected=True,
    bottleneck_work_centers=["PRESS_3"],
    oee_applied=0.82,
    excluded_rows=0,
    flag_count=2,
    reconstructed_rows=1,
    per_work_center=[WCLoad(wc="PRESS_3", utilization=0.94, available=500.0, demanded=470.0)],
)


def _mock_response(agent_dict: dict):
    """Build a mock Anthropic messages.create response that returns text JSON."""
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = json.dumps(agent_dict)
    response = MagicMock()
    response.content = [text_block]
    return response


def test_correct_numerics_returns_non_fallback():
    good_dict = {**_ENGINE_RESULT.to_agent1_dict(), "reasoning": "All fine.", "fallback": False}
    with patch("app.agents.agent1_capacity.ANTHROPIC_API_KEY", "fake-key"), \
         patch("app.agents.agent1_capacity.anthropic.Anthropic") as mock_cls:
        mock_cls.return_value.messages.create.return_value = _mock_response(good_dict)
        result = run_agent1(_ENGINE_RESULT)
    assert result.fallback is False
    assert result.reasoning == "All fine."


def test_mutated_utilization_triggers_fallback():
    mutated = {**_ENGINE_RESULT.to_agent1_dict(), "reasoning": "OK", "capacity_utilization": 0.99}
    with patch("app.agents.agent1_capacity.ANTHROPIC_API_KEY", "fake-key"), \
         patch("app.agents.agent1_capacity.anthropic.Anthropic") as mock_cls:
        mock_cls.return_value.messages.create.return_value = _mock_response(mutated)
        result = run_agent1(_ENGINE_RESULT)
    assert result.fallback is True
    assert result.capacity_utilization == _ENGINE_RESULT.capacity_utilization


def test_missing_api_key_triggers_fallback():
    with patch("app.agents.agent1_capacity.ANTHROPIC_API_KEY", ""):
        result = run_agent1(_ENGINE_RESULT)
    assert result.fallback is True


def test_api_error_triggers_fallback():
    import anthropic
    with patch("app.agents.agent1_capacity.ANTHROPIC_API_KEY", "fake-key"), \
         patch("app.agents.agent1_capacity.anthropic.Anthropic") as mock_cls:
        mock_cls.return_value.messages.create.side_effect = anthropic.APIError(
            message="rate limit", request=MagicMock(), body={}
        )
        result = run_agent1(_ENGINE_RESULT)
    assert result.fallback is True
