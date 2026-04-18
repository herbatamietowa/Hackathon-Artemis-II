"""Disaster simulation engine.

Models the impact of a factory going offline and computes which alternative
plants could absorb the displaced demand — including capacity, cost, transport
lead time, and carbon impact for each alternative.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ..api.schemas import DisasterAlternative, DisasterResult

logger = logging.getLogger(__name__)

# IEA 2026 grid intensity map — same as GCI and reallocation engines
_GRID_INTENSITY: dict[str, float] = {
    "Alpine":     0.15, "Iberia":     0.22, "West Coast": 0.25, "Andes":      0.26,
    "Cerrado":    0.28, "Baltics":    0.33, "Southeast":  0.38, "Southbay":   0.35,
    "Heartland":  0.40, "Midwest":    0.45, "Oceania":    0.52, "Carpathia":  0.55,
    "Pacific":    0.60, "Indochina":  0.65, "Levant":     0.78,
}


def _grid_intensity(plant_name: str) -> float:
    for key, val in _GRID_INTENSITY.items():
        if key.lower() in plant_name.lower():
            return val
    return 0.50


def compute_disaster_impact(
    offline_factory: str,
    scenario: str,
    period: str,
    duration_months: int,
    data_path: Path,
) -> DisasterResult:
    from .capacity import compute_capacity_plan

    # ── 1. Demand displaced by the offline factory ────────────────────────────
    try:
        offline_result = compute_capacity_plan(offline_factory, scenario, period, data_path)
        displaced_hours_per_period = offline_result.demanded_hours
        displaced_hours = displaced_hours_per_period * duration_months
    except Exception as exc:
        logger.error("Could not compute offline factory demand: %s", exc)
        displaced_hours_per_period = 0.0
        displaced_hours = 0.0

    # ── 2. Load reference data ────────────────────────────────────────────────
    df26 = pd.read_excel(data_path, sheet_name="2_6 Tool_material nr master")
    df25 = pd.read_excel(data_path, sheet_name="2_5 WC Schedule_limits")
    df23 = pd.read_excel(data_path, sheet_name="2_3 SAP MasterData")

    plant_names = (
        df25[["Plant", "Plant name"]].drop_duplicates("Plant")
        .set_index("Plant")["Plant name"].to_dict()
    )

    # Offline factory grid intensity & costs
    offline_intensity = _grid_intensity(plant_names.get(offline_factory, ""))
    offline_costs = df23[df23["G35 - Plant"] == offline_factory].set_index("Sap code")
    offline_lt    = float(offline_costs["Transportation Lanes Lead Time (CD)"].mean()) if not offline_costs.empty else 18.0

    # ── 3. Find materials at offline factory and alternatives ─────────────────
    active = df26[df26["Material Status"] == "Active"]
    offline_mats = set(active[active["Plant"] == offline_factory]["Sap code"].dropna())
    total_offline_mats = len(offline_mats)

    alt_rows = active[
        (active["Sap code"].isin(offline_mats)) & (active["Plant"] != offline_factory)
    ]
    plant_mat_count = alt_rows.groupby("Plant")["Sap code"].nunique().to_dict()

    # ── 4. Evaluate each alternative ─────────────────────────────────────────
    alternatives: list[DisasterAlternative] = []
    total_absorbable = 0.0

    for plant, mat_count in sorted(plant_mat_count.items(), key=lambda x: -x[1]):
        try:
            alt_result = compute_capacity_plan(plant, scenario, period, data_path)
        except Exception as exc:
            logger.warning("Skipping %s — capacity plan failed: %s", plant, exc)
            continue

        headroom = max(0.0, alt_result.available_hours - alt_result.demanded_hours)
        proj_util = (
            (alt_result.demanded_hours + displaced_hours_per_period) / alt_result.available_hours
            if alt_result.available_hours > 0 else 9.99
        )
        coverage_pct = round(mat_count / total_offline_mats * 100, 1) if total_offline_mats else 0.0

        # Cost delta vs offline factory (compatible materials only)
        compat_mats = set(active[active["Plant"] == plant]["Sap code"]) & offline_mats
        alt_costs = df23[(df23["Sap code"].isin(compat_mats)) & (df23["G35 - Plant"] == plant)].set_index("Sap code")
        src_costs  = offline_costs[offline_costs.index.isin(compat_mats)]
        shared_idx = alt_costs.index.intersection(src_costs.index)

        if len(shared_idx) > 0:
            deltas = (
                alt_costs.loc[shared_idx, "Standard Cost in EUR"]
                - src_costs.loc[shared_idx, "Standard Cost in EUR"]
            ) / src_costs.loc[shared_idx, "Standard Cost in EUR"] * 100
            cost_delta_pct = float(deltas.median())
            alt_lt = float(alt_costs.loc[shared_idx, "Transportation Lanes Lead Time (CD)"].mean())
            lt_delta = alt_lt - float(src_costs.loc[shared_idx, "Transportation Lanes Lead Time (CD)"].mean())
        else:
            cost_delta_pct, lt_delta = 0.0, 0.0

        # Carbon delta
        alt_intensity = _grid_intensity(plant_names.get(plant, ""))
        carbon_delta_pct = (
            (alt_intensity - offline_intensity) / offline_intensity * 100
            if offline_intensity else 0.0
        )

        alternatives.append(DisasterAlternative(
            plant=plant,
            plant_name=plant_names.get(plant, plant),
            materials_coverable=int(mat_count),
            total_offline_materials=total_offline_mats,
            coverage_pct=coverage_pct,
            current_utilization=round(alt_result.capacity_utilization, 4),
            projected_utilization=round(min(proj_util, 9.99), 4),
            capacity_headroom_hours=round(headroom, 2),
            overloaded=proj_util > 1.0,
            cost_delta_pct=round(cost_delta_pct, 1),
            transport_lt_delta_days=round(lt_delta, 1),
            grid_intensity=round(alt_intensity, 2),
            carbon_delta_pct=round(carbon_delta_pct, 1),
        ))
        total_absorbable += headroom * duration_months

    # Sort: most headroom first
    alternatives.sort(key=lambda a: (-a.capacity_headroom_hours, -a.materials_coverable))

    network_coverage = (
        min(100.0, total_absorbable / displaced_hours * 100) if displaced_hours > 0 else 100.0
    )
    unabsorbable = max(0.0, displaced_hours - total_absorbable)

    ai_insight = _build_insight(
        offline_factory, displaced_hours, duration_months,
        alternatives, network_coverage, unabsorbable,
    )

    return DisasterResult(
        offline_factory=offline_factory,
        scenario=scenario,
        period=period,
        duration_months=duration_months,
        displaced_hours=round(displaced_hours, 2),
        alternatives=alternatives,
        network_coverage_pct=round(network_coverage, 1),
        unabsorbable_hours=round(unabsorbable, 2),
        ai_insight=ai_insight,
    )


def _build_insight(
    offline_factory: str,
    displaced_hours: float,
    duration_months: int,
    alternatives: list[DisasterAlternative],
    network_coverage: float,
    unabsorbable: float,
) -> str:
    if not alternatives:
        return (
            f"A {duration_months}-month outage at {offline_factory} would displace "
            f"{displaced_hours:.0f} hours of demand with no identified alternatives in the network."
        )

    feasible = [a for a in alternatives if not a.overloaded]
    best = alternatives[0]

    cheapest = min(alternatives, key=lambda a: a.cost_delta_pct)
    greenest = min(alternatives, key=lambda a: a.carbon_delta_pct)

    if network_coverage >= 100:
        coverage_line = (
            f"A {duration_months}-month outage at {offline_factory} displaces {displaced_hours:.0f} hours — "
            f"the network can fully absorb this across {len(feasible)} plants without overloading."
        )
    else:
        coverage_line = (
            f"A {duration_months}-month outage at {offline_factory} displaces {displaced_hours:.0f} hours — "
            f"the network covers {network_coverage:.0f}%, leaving {unabsorbable:.0f}h unserviceable."
        )

    best_line = (
        f"{best.plant} ({best.plant_name}) leads with {best.capacity_headroom_hours:.0f}h headroom "
        f"and {best.coverage_pct:.0f}% material compatibility"
    )
    cost_note = f", but at {best.cost_delta_pct:+.0f}% production cost vs {offline_factory}" if abs(best.cost_delta_pct) > 5 else ""
    carbon_note = (
        f" {greenest.plant} is the lowest-carbon option at {greenest.grid_intensity:.2f} gCO\u2082/kWh."
        if greenest.plant != best.plant else
        f" Its grid intensity ({best.grid_intensity:.2f} gCO\u2082/kWh) is {'higher' if best.carbon_delta_pct > 0 else 'lower'} than {offline_factory}."
    )

    return f"{coverage_line} {best_line}{cost_note}.{carbon_note}"
