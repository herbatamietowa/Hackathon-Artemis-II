"""Two-agent debate for production path selection.

Agent 1 (Cost Specialist, Groq) proposes the most cost-efficient path.
Agent 2 (Sustainability Director, Gemini) reviews and approves or challenges.
Max 2 rounds — debate always terminates.
"""
from __future__ import annotations
import json
import logging
import re
from typing import Optional

import openai

from ..config import (
    AGENT1_MODEL, AGENT2_FALLBACK_MODEL, AGENT2_MODEL,
    GEMINI_API_KEY, GEMINI_BASE_URL, GROQ_API_KEY, GROQ_BASE_URL,
)

logger = logging.getLogger(__name__)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _strip_and_parse(text: str) -> dict:
    text = _THINK_RE.sub("", text).strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    m = _JSON_RE.search(text)
    return json.loads(m.group() if m else text)


def _paths_summary(paths: list[dict]) -> str:
    lines = []
    for p in paths:
        lines.append(
            f"- {p['name']}: cost=€{p['total_cost_eur']:.0f}, "
            f"delivery={p['delivery_days']}d, carbon_score={p['carbon_score']:.0f}/100, "
            f"grid={p['grid_intensity']:.2f} gCO₂/kWh, plant={p['plant']} ({p['plant_name']}), "
            f"mode={p['mode']}"
        )
    return "\n".join(lines)


_AGENT1_SYSTEM = """You are a Cost Optimization Specialist debating production path selection.
Recommend the MOST COST-EFFICIENT path from the given options.
Justify with specific figures (cost, delivery days).

Output ONLY valid JSON:
{
  "chosen_path": "<exact path name from the list>",
  "reasoning": "<2-3 sentences citing specific cost and delivery figures>",
  "key_factors": ["<factor>", "<factor>", "<factor>"]
}"""

_AGENT2_SYSTEM = """You are a Sustainability and Resilience Director debating production path selection.
Review the Cost Specialist's recommendation. APPROVE it if carbon impact is acceptable.
Challenge with REOPEN DEBATE only if a significantly greener option exists (carbon_score difference > 15 points).
You MUST reach APPROVED in round 2 — the debate must end.

Output ONLY valid JSON:
{
  "verdict": "APPROVED" or "REOPEN DEBATE",
  "chosen_path": "<your recommended path name>",
  "reasoning": "<2-3 sentences on sustainability assessment with specific figures>",
  "key_factors": ["<factor>", "<factor>", "<factor>"]
}"""


def _fallback_agent1(paths: list[dict]) -> dict:
    best = min(paths, key=lambda p: p["total_cost_eur"])
    return {
        "chosen_path": best["name"],
        "reasoning": (
            f"{best['name']} offers the lowest cost at €{best['total_cost_eur']:.0f} "
            f"with {best['delivery_days']} day delivery from {best['plant_name']}. "
            "Cost efficiency drives selection."
        ),
        "key_factors": ["Total cost", "Delivery time", "Plant availability"],
    }


def _fallback_agent2(paths: list[dict], agent1_choice: str, force_approve: bool = False) -> dict:
    chosen = next((p for p in paths if p["name"] == agent1_choice), paths[0])
    greenest = min(paths, key=lambda p: p["carbon_score"])
    carbon_diff = chosen["carbon_score"] - greenest["carbon_score"]
    if not force_approve and carbon_diff > 15:
        return {
            "verdict": "REOPEN DEBATE",
            "chosen_path": greenest["name"],
            "reasoning": (
                f"{agent1_choice} has carbon score {chosen['carbon_score']:.0f}/100 vs "
                f"{greenest['carbon_score']:.0f}/100 for {greenest['name']}. "
                f"The {carbon_diff:.0f}-point gap warrants routing to the greener option."
            ),
            "key_factors": ["Carbon score", "Grid intensity", "Environmental impact"],
        }
    return {
        "verdict": "APPROVED",
        "chosen_path": agent1_choice,
        "reasoning": (
            f"{agent1_choice} is acceptable on sustainability grounds "
            f"(carbon score {chosen['carbon_score']:.0f}/100, grid {chosen['grid_intensity']:.2f} gCO₂/kWh). "
            "Cost and delivery balance justifies this selection."
        ),
        "key_factors": ["Carbon score", "Cost balance", "Delivery reliability"],
    }


def _call_agent1(paths: list[dict], debate_context: list[dict] | None) -> dict:
    if not GROQ_API_KEY:
        return _fallback_agent1(paths)
    user_msg = f"Available production paths:\n\n{_paths_summary(paths)}"
    if debate_context:
        user_msg += f"\n\nDebate so far:\n{json.dumps(debate_context, indent=2)}\nMaintain or update your position."
    try:
        client = openai.OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)
        resp = client.chat.completions.create(
            model=AGENT1_MODEL,
            messages=[
                {"role": "system", "content": _AGENT1_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=512,
        )
        return _strip_and_parse(resp.choices[0].message.content or "")
    except Exception as exc:
        logger.warning("Agent1 path debate error: %s", exc)
        return _fallback_agent1(paths)


def _call_agent2(paths: list[dict], a1: dict, debate_context: list[dict], force_approve: bool = False) -> dict:
    if not GEMINI_API_KEY:
        return _fallback_agent2(paths, a1.get("chosen_path", paths[0]["name"]), force_approve)
    user_msg = (
        f"Available paths:\n\n{_paths_summary(paths)}\n\n"
        f"Cost Specialist recommends: {a1.get('chosen_path')}\n"
        f"Their reasoning: {a1.get('reasoning')}\n\n"
        f"Full debate:\n{json.dumps(debate_context, indent=2)}"
    )
    if force_approve:
        user_msg += "\n\nThis is the final round — you MUST output APPROVED."
    for model in [AGENT2_MODEL, AGENT2_FALLBACK_MODEL]:
        try:
            client = openai.OpenAI(api_key=GEMINI_API_KEY, base_url=GEMINI_BASE_URL)
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _AGENT2_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                max_tokens=512,
            )
            return _strip_and_parse(resp.choices[0].message.content or "")
        except Exception as exc:
            logger.warning("Agent2 path debate error (model=%s): %s", model, exc)
    return _fallback_agent2(paths, a1.get("chosen_path", paths[0]["name"]), force_approve)


def run_path_debate(
    paths: list[dict],
    plate_code: str,
    plate_name: str,
    user_argument: Optional[str] = None,
) -> dict:
    """Debate which production path to choose. Always terminates within 2 rounds."""
    debate_history: list[dict] = []

    if user_argument:
        debate_history.append({"agent_name": "User", "message": user_argument})

    # Round 1
    a1 = _call_agent1(paths, debate_context=debate_history or None)
    debate_history.append({"agent_name": "Cost Specialist", "message": a1.get("reasoning", "")})

    a2 = _call_agent2(paths, a1, debate_context=debate_history)
    debate_history.append({
        "agent_name": "Sustainability Director",
        "message": a2.get("reasoning", ""),
        "verdict": a2.get("verdict"),
    })

    # Round 2 (only if reopened — forced approval to terminate)
    if a2.get("verdict") == "REOPEN DEBATE":
        a1 = _call_agent1(paths, debate_context=debate_history)
        debate_history.append({"agent_name": "Cost Specialist", "message": a1.get("reasoning", "")})

        a2 = _call_agent2(paths, a1, debate_context=debate_history, force_approve=True)
        debate_history.append({
            "agent_name": "Sustainability Director",
            "message": a2.get("reasoning", ""),
            "verdict": a2.get("verdict"),
        })

    agreed_path_name = a2.get("chosen_path") or a1.get("chosen_path") or paths[0]["name"]
    # Validate it's actually one of the paths
    valid_names = {p["name"] for p in paths}
    if agreed_path_name not in valid_names:
        agreed_path_name = paths[0]["name"]

    parameters_considered = list({
        f for factors in [a1.get("key_factors", []), a2.get("key_factors", [])]
        for f in factors
    })

    status = "USER_OVERRIDE" if user_argument else (
        "CONSENSUS" if a2.get("verdict") == "APPROVED" else "CONTESTED"
    )

    return {
        "agreed_path_name": agreed_path_name,
        "debate_history": debate_history,
        "status": status,
        "parameters_considered": parameters_considered,
    }
