"""Agent 2 — Gemini 2.0 Flash via OpenAI-compatible SDK.

Contract:
- Receives Agent 1 JSON ONLY (no raw data access)
- Returns Agent2Verdict with verdict / strategy / sustainability_recommendation
- Retries with fallback model on parse failure
- Falls back to deterministic verdict if Gemini unavailable
"""
from __future__ import annotations
import json
import logging
import re
from pathlib import Path

import openai

from ..api.schemas import Agent1Result, Agent2Verdict
from ..config import AGENT2_FALLBACK_MODEL, AGENT2_MODEL, BOTTLENECK_THRESHOLD, GEMINI_API_KEY, GEMINI_BASE_URL

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (Path(__file__).parent / "prompts" / "agent2_system.md").read_text()

# Gemini 2.0 Flash doesn't emit think tags, but strip them defensively
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def _strip_think(text: str) -> str:
    return _THINK_RE.sub("", text).strip()


def _deterministic_verdict(agent1: Agent1Result) -> Agent2Verdict:
    """Fallback: derive verdict from engine numbers without calling Gemini."""
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
    """Run Agent 2 via Gemini. Returns Agent2Verdict (fallback=True if unavailable)."""
    if not GEMINI_API_KEY:
        return _deterministic_verdict(agent1)

    client = openai.OpenAI(api_key=GEMINI_API_KEY, base_url=GEMINI_BASE_URL)
    user_content = json.dumps(agent1.model_dump())

    for attempt, model in enumerate([AGENT2_MODEL, AGENT2_FALLBACK_MODEL]):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=512,
            )
            raw = _strip_think(response.choices[0].message.content or "")
            data = json.loads(raw)
            return Agent2Verdict(
                verdict=data["verdict"],
                strategy=data["strategy"],
                sustainability_recommendation=data["sustainability_recommendation"],
                fallback=False,
            )
        except json.JSONDecodeError as exc:
            logger.warning("Agent 2 JSON parse error (attempt %d, model=%s): %s", attempt + 1, model, exc)
        except openai.APIError as exc:
            logger.warning("Agent 2 Gemini API error (attempt %d, model=%s): %s", attempt + 1, model, exc)
            break
        except Exception as exc:
            logger.exception("Agent 2 unexpected error: %s", exc)
            break

    return _deterministic_verdict(agent1)
