"""Agent 1 — Anthropic SDK wrapper around compute_capacity_plan.

Agent 1's contract:
- Calls compute_capacity tool (deterministic engine)
- Fills reasoning field with narrative
- Copies ALL numeric fields verbatim from the engine result
- If Anthropic call fails OR numeric guard fires → fallback mode (no retry)
"""
from __future__ import annotations
import json
import logging
from pathlib import Path

import anthropic

from ..api.schemas import Agent1Result, CapacityPlanResult
from ..config import AGENT1_MODEL, ANTHROPIC_API_KEY, DATA_PATH
from ..engine.capacity import compute_capacity_plan

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "agent1_system.md").read_text()

_TOOL_SPEC = {
    "name": "compute_capacity",
    "description": "Compute factory capacity utilization for a given scenario and period. Returns the authoritative numeric result.",
    "input_schema": {
        "type": "object",
        "properties": {
            "factory":  {"type": "string", "description": "Plant code, e.g. 'NW01'"},
            "scenario": {"type": "string", "description": "One of: 100_pct, probability_weighted, high_prob_only"},
            "period":   {"type": "string", "description": "Month label 'M YYYY', e.g. '5 2026'"},
        },
        "required": ["factory", "scenario", "period"],
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


def run_agent1(engine_result: CapacityPlanResult) -> Agent1Result:
    """Run Agent 1. Returns Agent1Result (fallback=True if Anthropic unavailable or guard fires)."""
    if not ANTHROPIC_API_KEY:
        return _fallback_result(engine_result, "ANTHROPIC_API_KEY not set.")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    factory  = engine_result.factory
    scenario = engine_result.scenario
    period   = engine_result.period

    messages = [
        {
            "role": "user",
            "content": (
                f"Analyze capacity for factory={factory}, scenario={scenario}, period={period}. "
                "Call the compute_capacity tool first, then emit your JSON report."
            ),
        }
    ]

    try:
        # Agentic loop — keep going until Claude stops using tools
        while True:
            response = client.messages.create(
                model=AGENT1_MODEL,
                max_tokens=1024,
                system=_SYSTEM_PROMPT,
                tools=[_TOOL_SPEC],
                messages=messages,
            )

            # Collect any tool use blocks
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if b.type == "text"]

            if not tool_uses:
                # No tool call — parse text response as final JSON
                raw_text = text_blocks[0].text.strip() if text_blocks else ""
                break

            # Execute the tool calls (should always be compute_capacity)
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for tu in tool_uses:
                inp = tu.input
                try:
                    result = compute_capacity_plan(
                        inp["factory"], inp["scenario"], inp.get("period"), DATA_PATH
                    )
                    tool_result_content = json.dumps(result.to_agent1_dict())
                except Exception as exc:
                    tool_result_content = json.dumps({"error": str(exc)})
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": tool_result_content,
                })
            messages.append({"role": "user", "content": tool_results})

        # Parse Claude's final JSON response
        agent_dict = json.loads(raw_text)

        # Numeric guard — if Claude mutated anything, fall back
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
    except anthropic.APIError as exc:
        logger.warning("Agent 1 Anthropic API error: %s", exc)
        return _fallback_result(engine_result, f"Anthropic API error: {exc}.")
    except Exception as exc:
        logger.exception("Agent 1 unexpected error: %s", exc)
        return _fallback_result(engine_result, f"Unexpected error: {exc}.")
