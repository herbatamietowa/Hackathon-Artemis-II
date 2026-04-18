"""Agent 2 — OpenAI SDK sustainability strategist.

Contract:
- Receives Agent 1 JSON ONLY (no raw data access)
- Returns Agent2Verdict with verdict / strategy / sustainability_recommendation
- Retries on JSON parse failure (max 2 attempts)
- Falls back to deterministic verdict if OpenAI unavailable or parse fails after retries
"""
from __future__ import annotations
import json
import logging
from pathlib import Path

import openai

from ..api.schemas import Agent1Result, Agent2Verdict
from ..config import AGENT2_FALLBACK_MODEL, AGENT2_MODEL, BOTTLENECK_THRESHOLD, OPENAI_API_KEY

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "agent2_system.md").read_text()


def _deterministic_verdict(agent1: Agent1Result) -> Agent2Verdict:
    """Fallback: derive verdict from engine numbers without calling OpenAI."""
    overloaded = (
        agent1.capacity_utilization >= BOTTLENECK_THRESHOLD
        or agent1.bottleneck_detected
    )
    if overloaded:
        wcs = ", ".join(agent1.bottleneck_work_centers) or "multiple work centers"
        return Agent2Verdict(
            verdict="CORRECTED",
            strategy=(
                f"Factory {agent1.factory} is at {agent1.capacity_utilization:.1%} utilization "
                f"under the {agent1.scenario} scenario with bottlenecks at {wcs}. "
                "Route overflow pressing volume to NW03 and review maintenance scheduling."
            ),
            sustainability_recommendation=(
                "NW03 has lower energy intensity than NW01. Routing overflow there reduces "
                "carbon impact while keeping NW01 within its rated operating range."
            ),
            fallback=True,
        )
    return Agent2Verdict(
        verdict="APPROVED",
        strategy=(
            f"Factory {agent1.factory} is within capacity limits at {agent1.capacity_utilization:.1%} "
            f"utilization under the {agent1.scenario} scenario. Current plan is sustainable."
        ),
        sustainability_recommendation=(
            "No overflow routing required. Monitor flag_count trends to catch data quality "
            "degradation before it affects planning accuracy."
        ),
        fallback=True,
    )


def run_agent2(agent1: Agent1Result) -> Agent2Verdict:
    """Run Agent 2. Returns Agent2Verdict (fallback=True if OpenAI unavailable)."""
    if not OPENAI_API_KEY:
        return _deterministic_verdict(agent1)

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    user_content = json.dumps(agent1.model_dump())

    for attempt in range(2):
        try:
            model = AGENT2_MODEL if attempt == 0 else AGENT2_FALLBACK_MODEL
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                max_completion_tokens=512,
            )
            raw = response.choices[0].message.content or ""
            data = json.loads(raw.strip())
            return Agent2Verdict(
                verdict=data["verdict"],
                strategy=data["strategy"],
                sustainability_recommendation=data["sustainability_recommendation"],
                fallback=False,
            )
        except json.JSONDecodeError as exc:
            logger.warning("Agent 2 JSON parse error (attempt %d): %s", attempt + 1, exc)
        except openai.APIError as exc:
            logger.warning("Agent 2 OpenAI API error (attempt %d): %s", attempt + 1, exc)
            break
        except Exception as exc:
            logger.exception("Agent 2 unexpected error: %s", exc)
            break

    return _deterministic_verdict(agent1)
