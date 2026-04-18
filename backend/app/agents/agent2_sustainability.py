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

_GCI_SYSTEM = """You are a supply chain sustainability advisor. Given GCI optimization data, produce a single concise insight (2-4 sentences) explaining the recommended sourcing route and what switching to the greenest alternative would save. Be specific: name the plants, regions, grid intensity values, and the carbon saving percentage. Output only the insight text — no JSON, no headers."""

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


_GCI_SYSTEM = """You are a supply chain sustainability advisor. Given GCI optimization data, produce a single concise insight (2-4 sentences) explaining the recommended sourcing route and what switching to the greenest alternative would save. Be specific: name the plants, regions, grid intensity values, and the carbon saving percentage. Output only the insight text — no JSON, no headers."""


def _deterministic_gci_insight(ctx: dict) -> str:
    rec = ctx.get("recommended_plant_name", ctx.get("recommended_plant", "?"))
    green = ctx.get("greenest_plant_name", ctx.get("greenest_plant", "?"))
    saving = ctx.get("green_potential_saving_pct", 0)
    mode = ctx.get("recommended_mode", "Standard")
    intensity = ctx.get("greenest_grid_intensity", 0)
    if rec == green:
        return (
            f"The recommended plant ({rec}) is already the greenest option in the network "
            f"with a grid intensity of {intensity:.2f} gCO₂/kWh. "
            f"No further routing optimisation is available for this material."
        )
    return (
        f"The current recommendation routes production to {rec} via {mode}. "
        f"Shifting to {green} (grid intensity {intensity:.2f} gCO₂/kWh) would reduce "
        f"the carbon score by {saving:.1f}% — the lowest footprint achievable across the network. "
        f"Consider this trade-off when sustainability weighting is a priority."
    )


def run_agent2_gci(ai_context: dict) -> str:
    """Return a natural-language GCI insight from Gemini, with deterministic fallback."""
    if not GEMINI_API_KEY:
        return _deterministic_gci_insight(ai_context)

    client = openai.OpenAI(api_key=GEMINI_API_KEY, base_url=GEMINI_BASE_URL)
    user_content = json.dumps(ai_context, indent=2)

    for attempt, model in enumerate([AGENT2_MODEL, AGENT2_FALLBACK_MODEL]):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _GCI_SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=256,
            )
            return _strip_think(response.choices[0].message.content or "").strip()
        except (openai.APIError, Exception) as exc:
            logger.warning("GCI agent error (attempt %d, model=%s): %s", attempt + 1, model, exc)

    return _deterministic_gci_insight(ai_context)
