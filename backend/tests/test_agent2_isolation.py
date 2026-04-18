"""Test that Agent 2 never touches raw data (no pd.read_excel calls)."""
import json
from unittest.mock import MagicMock, patch

from app.agents.agent2_sustainability import run_agent2
from app.api.schemas import Agent1Result

_AGENT1_FIXTURE = Agent1Result(
    scenario="probability_weighted",
    factory="NW01",
    period="5 2026",
    capacity_utilization=0.87,
    available_hours=1240.0,
    demanded_hours=1078.8,
    bottleneck_detected=True,
    bottleneck_work_centers=["PRESS_3", "PRESS_5"],
    oee_applied=0.82,
    excluded_rows=12,
    flag_count=7,
    reconstructed_rows=3,
    reasoning="Capacity at 87% with two bottlenecks.",
    fallback=False,
)

_GOOD_RESPONSE = json.dumps({
    "verdict": "CORRECTED",
    "strategy": "Route overflow to NW03.",
    "sustainability_recommendation": "NW03 is greener.",
})


def test_agent2_never_reads_excel():
    """pd.read_excel must never be called inside run_agent2."""
    with patch("app.agents.agent2_sustainability.GEMINI_API_KEY", "fake-key"), \
         patch("app.agents.agent2_sustainability.openai.OpenAI") as mock_cls, \
         patch("pandas.read_excel") as mock_read_excel:
        choice = MagicMock()
        choice.message.content = _GOOD_RESPONSE
        mock_cls.return_value.chat.completions.create.return_value.choices = [choice]
        run_agent2(_AGENT1_FIXTURE)
    assert mock_read_excel.call_count == 0, "Agent 2 must not call pd.read_excel"


def test_agent2_returns_valid_verdict():
    with patch("app.agents.agent2_sustainability.GEMINI_API_KEY", "fake-key"), \
         patch("app.agents.agent2_sustainability.openai.OpenAI") as mock_cls:
        choice = MagicMock()
        choice.message.content = _GOOD_RESPONSE
        mock_cls.return_value.chat.completions.create.return_value.choices = [choice]
        result = run_agent2(_AGENT1_FIXTURE)
    assert result.verdict == "CORRECTED"
    assert result.fallback is False


def test_agent2_falls_back_when_no_key():
    with patch("app.agents.agent2_sustainability.GEMINI_API_KEY", ""):
        result = run_agent2(_AGENT1_FIXTURE)
    assert result.fallback is True
    assert result.verdict in ("APPROVED", "CORRECTED")


def test_agent2_falls_back_on_bad_json():
    with patch("app.agents.agent2_sustainability.GEMINI_API_KEY", "fake-key"), \
         patch("app.agents.agent2_sustainability.openai.OpenAI") as mock_cls:
        choice = MagicMock()
        choice.message.content = "not json at all"
        mock_cls.return_value.chat.completions.create.return_value.choices = [choice]
        result = run_agent2(_AGENT1_FIXTURE)
    assert result.fallback is True
