"""Agent 1 — Groq (Llama 3.3 70b) via OpenAI-compatible SDK.

Contract:
- Calls compute_capacity tool (deterministic engine)
- Fills reasoning field with narrative
- Copies ALL numeric fields verbatim from the engine result
- If Groq call fails OR numeric guard fires → fallback mode (no retry)
"""
from __future__ import annotations
import json
import logging
from pathlib import Path

import openai

from ..api.schemas import Agent1Result, CapacityPlanResult
from ..config import AGENT1_MODEL, GROQ_API_KEY, GROQ_BASE_URL, DATA_PATH
from ..engine.capacity import compute_capacity_plan

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "agent1_system.md").read_text()

_TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "compute_capacity",
        "description": "Compute factory capacity utilization for a given scenario and period. Returns the authoritative numeric result.",
        "parameters": {
            "type": "object",
            "properties": {
                "factory":  {"type": "string", "description": "Plant code, e.g. 'NW01'"},
                "scenario": {"type": "string", "description": "One of: 100_pct, probability_weighted, high_prob_only"},
                "period":   {"type": "string", "description": "Month label 'M YYYY', e.g. '5 2026'"},
            },
            "required": ["factory", "scenario", "period"],
        },
    },
}


def _fallback_result(engine_result: CapacityPlanResult, reason: str) -> Agent1Result:
    return Agent1Result(
        **engine_result.to_agent1_dict(),
        reasoning=(
            f"[OFFLINE] {reason} "
            f"Capacity utilization: {engine_result.capacity_utilization:.1%}. "
            f"Bottleneck detected: {engine_result.bottleneck_detected}."
        ),
        fallback=True,
    )


def _numeric_guard(agent_dict: dict, engine_result: CapacityPlanResult) -> bool:
    """Return True if agent output matches engine numerics exactly."""
    numeric_fields = [
        "capacity_utilization", "available_hours", "demanded_hours",
        "oee_applied", "excluded_rows", "flag_count", "reconstructed_rows",
    ]
    for field in numeric_fields:
        if agent_dict.get(field) != getattr(engine_result, field):
            logger.warning(
                "Numeric guard failed for '%s': agent=%s engine=%s",
                field, agent_dict.get(field), getattr(engine_result, field),
            )
            return False
    if agent_dict.get("bottleneck_detected") != engine_result.bottleneck_detected:
        logger.warning("Numeric guard: bottleneck_detected mismatch")
        return False
    if set(agent_dict.get("bottleneck_work_centers", [])) != set(engine_result.bottleneck_work_centers):
        logger.warning("Numeric guard: bottleneck_work_centers mismatch")
        return False
    return True


def run_agent1(engine_result: CapacityPlanResult, debate_context: list[dict] | None = None) -> Agent1Result:
    """Run Agent 1 via Groq. Returns Agent1Result (fallback=True if unavailable or guard fires)."""
    if not GROQ_API_KEY:
        return _fallback_result(engine_result, "GROQ_API_KEY not set.")

    client = openai.OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)
    factory  = engine_result.factory
    scenario = engine_result.scenario
    period   = engine_result.period

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Analyze capacity for factory={factory}, scenario={scenario}, period={period}. "
                "Call the compute_capacity tool first, then emit your JSON report."
                + (f"\n\nDebate Context:\n{json.dumps(debate_context)}" if debate_context else "")
            ),
        },
    ]

    try:
        # Agentic loop — keep going until model stops calling tools
        while True:
            response = client.chat.completions.create(
                model=AGENT1_MODEL,
                messages=messages,
                tools=[_TOOL_SPEC],
                tool_choice="auto",
                max_tokens=1024,
            )
            msg = response.choices[0].message

            if not msg.tool_calls:
                raw_text = msg.content or ""
                break

            # Append assistant turn (with tool_calls) then execute each call
            messages.append(msg)
            for tc in msg.tool_calls:
                inp = json.loads(tc.function.arguments)
                try:
                    result = compute_capacity_plan(
                        inp["factory"], inp["scenario"], inp.get("period"), DATA_PATH
                    )
                    tool_content = json.dumps(result.to_agent1_dict())
                except Exception as exc:
                    tool_content = json.dumps({"error": str(exc)})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": tool_content,
                })

        agent_dict = json.loads(raw_text)

        if not _numeric_guard(agent_dict, engine_result):
            return _fallback_result(engine_result, "Numeric guard fired: agent modified engine output.")

        return Agent1Result(
            **engine_result.to_agent1_dict(),
            reasoning=agent_dict.get("reasoning", ""),
            fallback=False,
        )

    except json.JSONDecodeError as exc:
        logger.warning("Agent 1 JSON parse error: %s", exc)
        return _fallback_result(engine_result, "Agent 1 returned unparseable JSON.")
    except openai.APIError as exc:
        logger.warning("Agent 1 Groq API error: %s", exc)
        return _fallback_result(engine_result, f"Groq API error: {exc}.")
    except Exception as exc:
        logger.exception("Agent 1 unexpected error: %s", exc)
        return _fallback_result(engine_result, f"Unexpected error: {exc}.")
