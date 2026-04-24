"""Two-agent synthesis debate for production path generation.

Agent 1 (Cost Specialist, Groq) proposes parameters that minimise spend.
Agent 2 (Sustainability Director, Gemini) counters with adjustments to lower carbon.
They converge on a new, synthesised path — not a selection from the existing 3.
Max 2 rounds. Always terminates.
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


def _paths_context(paths: list[dict]) -> str:
    """Build a feasible-space summary from the 3 reference paths."""
    lines = ["Reference paths (feasible bounds — synthesise within this space):"]
    for p in paths:
        lines.append(
            f"  {p['name']}: cost=€{p['total_cost_eur']:.0f}, delivery={p['delivery_days']}d, "
            f"carbon={p['carbon_score']:.0f}/100, grid={p['grid_intensity']:.2f} gCO₂/kWh, "
            f"plant={p['plant']} ({p['plant_name']}), mode={p['mode']}"
        )
    costs = [p['total_cost_eur'] for p in paths]
    days  = [p['delivery_days'] for p in paths]
    carbs = [p['carbon_score'] for p in paths]
    lines += [
        f"Cost range:     €{min(costs):.0f} – €{max(costs):.0f}",
        f"Delivery range: {min(days)} – {max(days)} days",
        f"Carbon range:   {min(carbs):.0f} – {max(carbs):.0f} / 100",
        f"Feasible plants: {', '.join(p['plant'] + ' (' + p['plant_name'] + ')' for p in paths)}",
        f"Available modes: {', '.join(sorted({p['mode'] for p in paths}))}",
    ]
    return "\n".join(lines)


# ── Prompts ───────────────────────────────────────────────────────────────────

_AGENT1_SYSTEM = """You are a Cost Optimization Specialist proposing a production configuration.
You receive 3 reference paths that define the feasible cost/delivery/carbon space.
Synthesise OPTIMAL parameters that minimise total cost — you are not limited to picking one of the 3 paths.
Propose the best plant + mode combination and realistic cost/delivery figures.

Output ONLY valid JSON (no markdown fences):
{
  "plant": "<plant code from the feasible list>",
  "plant_name": "<plant full name>",
  "mode": "<Economy|Standard|Express>",
  "total_cost_eur": <number>,
  "delivery_days": <integer>,
  "carbon_score": <number 0-100>,
  "grid_intensity": <number>,
  "reasoning": "<2-3 sentences with specific figures justifying cost choices>",
  "key_factors": ["<factor>", "<factor>", "<factor>"]
}"""

_AGENT2_SYSTEM = """You are a Sustainability Director reviewing a cost-optimised production proposal.
Adjust the parameters to lower carbon footprint. You may change plant, mode, or both.
Quantify every trade-off explicitly (e.g. "+€1 500 for -10 carbon points").
You MUST output APPROVED in round 2 — the debate always terminates.

Output ONLY valid JSON (no markdown fences):
{
  "verdict": "APPROVED" or "REOPEN DEBATE",
  "plant": "<your recommended plant code>",
  "plant_name": "<plant full name>",
  "mode": "<Economy|Standard|Express>",
  "total_cost_eur": <number>,
  "delivery_days": <integer>,
  "carbon_score": <number 0-100>,
  "grid_intensity": <number>,
  "reasoning": "<2-3 sentences on sustainability adjustments with specific figures>",
  "tradeoffs": ["<e.g. +€1 500 vs. cheapest for -10 carbon score points>", "<another tradeoff>"],
  "key_factors": ["<factor>", "<factor>", "<factor>"]
}"""


# ── Fallbacks (deterministic) ─────────────────────────────────────────────────

def _fallback_agent1(paths: list[dict]) -> dict:
    best = min(paths, key=lambda p: p["total_cost_eur"])
    return {
        "plant": best["plant"], "plant_name": best["plant_name"], "mode": best["mode"],
        "total_cost_eur": best["total_cost_eur"], "delivery_days": best["delivery_days"],
        "carbon_score": best["carbon_score"], "grid_intensity": best["grid_intensity"],
        "reasoning": (
            f"Routing to {best['plant_name']} via {best['mode']} minimises cost at "
            f"€{best['total_cost_eur']:.0f} with {best['delivery_days']}-day delivery."
        ),
        "key_factors": ["Total cost", "Delivery time", "Plant efficiency"],
    }


def _fallback_agent2(paths: list[dict], a1: dict, force_approve: bool = False) -> dict:
    greenest = min(paths, key=lambda p: p["carbon_score"])
    carbon_gap = a1.get("carbon_score", 100) - greenest["carbon_score"]
    if not force_approve and carbon_gap > 15:
        mid_cost = round((a1.get("total_cost_eur", 0) + greenest["total_cost_eur"]) / 2, 2)
        mid_days = round((a1.get("delivery_days", 0) + greenest["delivery_days"]) / 2)
        cost_delta = mid_cost - a1.get("total_cost_eur", 0)
        return {
            "verdict": "REOPEN DEBATE",
            "plant": greenest["plant"], "plant_name": greenest["plant_name"], "mode": greenest["mode"],
            "total_cost_eur": mid_cost, "delivery_days": mid_days,
            "carbon_score": greenest["carbon_score"], "grid_intensity": greenest["grid_intensity"],
            "reasoning": (
                f"{greenest['plant_name']} cuts carbon by {carbon_gap:.0f} points. "
                f"Blending to €{mid_cost:.0f} / {mid_days}d as a cost-sustainability compromise."
            ),
            "tradeoffs": [f"+€{cost_delta:.0f} vs. cheapest option for -{carbon_gap:.0f} carbon score points"],
            "key_factors": ["Carbon score", "Cost-carbon balance", "Grid intensity"],
        }
    return {
        "verdict": "APPROVED",
        "plant": a1.get("plant", ""), "plant_name": a1.get("plant_name", ""), "mode": a1.get("mode", ""),
        "total_cost_eur": a1.get("total_cost_eur", 0), "delivery_days": a1.get("delivery_days", 0),
        "carbon_score": a1.get("carbon_score", 0), "grid_intensity": a1.get("grid_intensity", 0),
        "reasoning": (
            f"Approved: {a1.get('plant_name')} via {a1.get('mode')} at €{a1.get('total_cost_eur', 0):.0f}. "
            f"Carbon score {a1.get('carbon_score', 0):.0f}/100 is within acceptable bounds."
        ),
        "tradeoffs": [],
        "key_factors": ["Carbon acceptability", "Cost efficiency", "Delivery reliability"],
    }


# ── LLM calls ─────────────────────────────────────────────────────────────────

def _call_agent1(paths: list[dict], debate_context: list[dict] | None) -> dict:
    if not GROQ_API_KEY:
        return _fallback_agent1(paths)
    user_msg = _paths_context(paths)
    if debate_context:
        user_msg += f"\n\nDebate so far:\n{json.dumps(debate_context, indent=2)}\nRevise your proposal if needed."
    try:
        client = openai.OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)
        resp = client.chat.completions.create(
            model=AGENT1_MODEL,
            messages=[{"role": "system", "content": _AGENT1_SYSTEM}, {"role": "user", "content": user_msg}],
            max_tokens=600,
        )
        return _strip_and_parse(resp.choices[0].message.content or "")
    except Exception as exc:
        logger.warning("Agent1 synthesis error: %s", exc)
        return _fallback_agent1(paths)


def _call_agent2(paths: list[dict], a1: dict, debate_context: list[dict], force_approve: bool = False) -> dict:
    if not GEMINI_API_KEY:
        return _fallback_agent2(paths, a1, force_approve)
    user_msg = (
        f"{_paths_context(paths)}\n\n"
        f"Cost Specialist proposes: plant={a1.get('plant')} ({a1.get('plant_name')}), "
        f"mode={a1.get('mode')}, cost=€{a1.get('total_cost_eur'):.0f}, "
        f"delivery={a1.get('delivery_days')}d, carbon={a1.get('carbon_score'):.0f}/100\n"
        f"Their reasoning: {a1.get('reasoning')}\n\n"
        f"Full debate:\n{json.dumps(debate_context, indent=2)}"
    )
    if force_approve:
        user_msg += "\n\nFINAL ROUND — you MUST output APPROVED now."
    for model in [AGENT2_MODEL, AGENT2_FALLBACK_MODEL]:
        try:
            client = openai.OpenAI(api_key=GEMINI_API_KEY, base_url=GEMINI_BASE_URL)
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": _AGENT2_SYSTEM}, {"role": "user", "content": user_msg}],
                max_tokens=600,
            )
            return _strip_and_parse(resp.choices[0].message.content or "")
        except Exception as exc:
            logger.warning("Agent2 synthesis error (model=%s): %s", model, exc)
    return _fallback_agent2(paths, a1, force_approve)


# ── Synthesis helper ──────────────────────────────────────────────────────────

_CO2_REF_KG = 5_000.0  # same constant used in project_simulation.py carbon_score formula


def _synthesize_path(params: dict, ref_paths: list[dict]) -> dict:
    """Build a full SimulationPath-compatible dict from negotiated params + reference ratios."""
    def score(ref: dict) -> int:
        return (2 if ref["plant"] == params.get("plant") else 0) + (1 if ref["mode"] == params.get("mode") else 0)
    ref = max(ref_paths, key=score)

    total = float(params["total_cost_eur"])
    days  = int(params["delivery_days"])
    ref_total = ref["total_cost_eur"] or 1.0
    ref_days  = ref["delivery_days"] or 1

    plate_cost    = round(total * ref["plate_cost"] / ref_total, 2)
    gasket_cost   = round(total * ref["gasket_cost"] / ref_total, 2)
    shipping_cost = round(total - plate_cost - gasket_cost, 2)

    rm_days   = max(1, round(days * ref["raw_material_lt_days"] / ref_days))
    prod_days = max(1, round(days * ref["production_lt_days"] / ref_days))
    logi_days = max(1, days - rm_days - prod_days)

    # Derive CO2 from the negotiated carbon_score using the inverse of the simulation formula:
    # carbon_score = 100 - (total_co2 / 5000) * 100  =>  total_co2 = (100 - carbon_score) * 50
    carbon_score = float(params["carbon_score"])
    estimated_co2_kg = round(max(0.0, (100.0 - carbon_score) * _CO2_REF_KG / 100.0), 1)

    # Derive transport_mode from the agreed mode (Express always uses air)
    agreed_mode = params.get("mode", ref["mode"])
    if agreed_mode == "Express":
        transport_mode = "air"
    else:
        transport_mode = ref.get("transport_mode", "road")

    return {
        "name": "The AI Consensus",
        "icon": "🤝",
        "plant": params["plant"],
        "plant_name": params["plant_name"],
        "mode": agreed_mode,
        "transport_mode": transport_mode,
        "total_cost_eur": total,
        "plate_cost": plate_cost,
        "gasket_cost": gasket_cost,
        "shipping_cost": shipping_cost,
        "delivery_days": days,
        "raw_material_lt_days": rm_days,
        "production_lt_days": prod_days,
        "logistics_lt_days": logi_days,
        "carbon_score": carbon_score,
        "grid_intensity": float(params.get("grid_intensity", ref["grid_intensity"])),
        "scrap_factor": ref["scrap_factor"],
        "estimated_co2_kg": estimated_co2_kg,
    }


# ── Public entry point ────────────────────────────────────────────────────────

def run_path_debate(
    paths: list[dict],
    plate_code: str,
    plate_name: str,
    user_argument: Optional[str] = None,
) -> dict:
    """Synthesise a new consensus path via agent negotiation. Always terminates in ≤2 rounds."""
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

    # Round 2 if challenged — forced approval
    if a2.get("verdict") == "REOPEN DEBATE":
        a1 = _call_agent1(paths, debate_context=debate_history)
        debate_history.append({"agent_name": "Cost Specialist", "message": a1.get("reasoning", "")})

        a2 = _call_agent2(paths, a1, debate_context=debate_history, force_approve=True)
        debate_history.append({
            "agent_name": "Sustainability Director",
            "message": a2.get("reasoning", ""),
            "verdict": a2.get("verdict"),
        })

    # Final agreed params come from the last Sustainability Director output
    final_params = {**a1, **{k: v for k, v in a2.items() if k not in ("verdict", "reasoning", "tradeoffs", "key_factors")}}

    agreed_path = _synthesize_path(final_params, paths)
    tradeoffs = a2.get("tradeoffs", [])
    parameters_considered = list({
        f for factors in [a1.get("key_factors", []), a2.get("key_factors", [])] for f in factors
    })
    status = "USER_OVERRIDE" if user_argument else (
        "CONSENSUS" if a2.get("verdict") == "APPROVED" else "CONTESTED"
    )

    return {
        "agreed_path": agreed_path,
        "debate_history": debate_history,
        "status": status,
        "parameters_considered": parameters_considered,
        "tradeoffs": tradeoffs,
    }
