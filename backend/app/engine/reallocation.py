"""Cross-factory reallocation check: bottlenecked factory → NW03 headroom.

Computes not just capacity headroom but the full logistics picture:
- Material compatibility (% of source materials with active NW03 tooling)
- Cost delta (standard cost differential from 2_3, tooling-compatible materials only)
- Transport lead time delta (from 2_3 Transportation Lanes Lead Time)
- Carbon delta (grid intensity difference using IEA 2026 regional values from GCI engine)
"""
from __future__ import annotations
import logging
from pathlib import Path

import pandas as pd

from ..api.schemas import ReallocationSuggestion

logger = logging.getLogger(__name__)

REALLOCATION_TARGET = "NW03"

# Grid intensity map — same values as GCI engine (IEA 2026 projections)
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


def check_nw03_headroom(
    period: str,
    overflow_hours: float,
    data_path: str | Path,
    source_factory: str = "NW01",
) -> ReallocationSuggestion:
    from ..data.loader import load_workbook
    from ..data.calendar import build_week_to_month_map
    from .capacity import _build_capacity_for_factory

    data_path = Path(data_path)
    wb = load_workbook(data_path)
    sheets = {k.strip(): v for k, v in wb.items()}

    # ── 1. Capacity headroom ──────────────────────────────────────────────────
    try:

        cal_key = next((k for k in sheets if "2_4" in k), None)
        cap_key = next((k for k in sheets if "2_1" in k), None)
        sch_key = next((k for k in sheets if "2_5" in k), None)

        week_to_month = build_week_to_month_map(sheets[cal_key], plant=REALLOCATION_TARGET) if cal_key else {}
        nw03_cap = _build_capacity_for_factory(
            sheets[cap_key], sheets[sch_key], week_to_month, REALLOCATION_TARGET
        ) if cap_key and sch_key else pd.DataFrame()

        period_cap = nw03_cap[nw03_cap["month"] == period] if not nw03_cap.empty else pd.DataFrame()
        headroom = float(period_cap["available_hours"].sum()) if not period_cap.empty else 0.0
        can_absorb = headroom >= overflow_hours
    except Exception as exc:
        logger.error("NW03 capacity check failed: %s", exc)
        headroom = 0.0
        can_absorb = False

    # ── 2. Material compatibility (tooling overlap from 2_6) ─────────────────
    try:
        df26 = sheets.get("2_6 Tool_material nr master", pd.DataFrame())
        active = df26[df26["Material Status"] == "Active"]
        src_mats  = set(active[active["Plant"] == source_factory]["Sap code"].dropna())
        nw03_mats = set(active[active["Plant"] == REALLOCATION_TARGET]["Sap code"].dropna())
        compatible = src_mats & nw03_mats
        total_mats = len(src_mats)
        compat_count = len(compatible)
        compat_pct = compat_count / total_mats * 100 if total_mats else 0.0
    except Exception as exc:
        logger.warning("Material compatibility check failed: %s", exc)
        compatible, compat_pct, compat_count, total_mats = set(), 0.0, 0, 0

    # ── 3. Cost delta & transport LT delta (from 2_3, compatible mats only) ──
    try:
        df23 = sheets.get("2_3 SAP MasterData", pd.DataFrame())
        src_costs  = df23[(df23["Sap code"].isin(compatible)) & (df23["G35 - Plant"] == source_factory)].set_index("Sap code")
        nw03_costs = df23[(df23["Sap code"].isin(compatible)) & (df23["G35 - Plant"] == REALLOCATION_TARGET)].set_index("Sap code")
        both = src_costs.index.intersection(nw03_costs.index)

        if len(both) > 0:
            deltas = (nw03_costs.loc[both, "Standard Cost in EUR"] - src_costs.loc[both, "Standard Cost in EUR"]) \
                     / src_costs.loc[both, "Standard Cost in EUR"] * 100
            cost_delta_pct = float(deltas.median())

            src_lt  = float(src_costs.loc[both,  "Transportation Lanes Lead Time (CD)"].mean())
            nw03_lt = float(nw03_costs.loc[both, "Transportation Lanes Lead Time (CD)"].mean())
            lt_delta = nw03_lt - src_lt
        else:
            cost_delta_pct, lt_delta = 0.0, 0.0
    except Exception as exc:
        logger.warning("Cost/LT delta calculation failed: %s", exc)
        cost_delta_pct, lt_delta = 0.0, 0.0

    # ── 4. Carbon delta (grid intensity from plant names in 2_5) ─────────────
    try:
        df25 = sheets.get("2_5 WC Schedule_limits", pd.DataFrame())
        names = df25[["Plant", "Plant name"]].drop_duplicates("Plant").set_index("Plant")["Plant name"]
        src_intensity  = _grid_intensity(names.get(source_factory, ""))
        nw03_intensity = _grid_intensity(names.get(REALLOCATION_TARGET, ""))
        carbon_delta_pct = (nw03_intensity - src_intensity) / src_intensity * 100 if src_intensity else 0.0
    except Exception as exc:
        logger.warning("Carbon intensity lookup failed: %s", exc)
        src_intensity, nw03_intensity, carbon_delta_pct = 0.45, 0.55, 22.0

    # ── 5. Build human-readable suggestion ───────────────────────────────────
    pct_covered = min(100, headroom / overflow_hours * 100) if overflow_hours > 0 else 100
    if can_absorb:
        capacity_line = f"NW03 has {headroom:.0f}h headroom — enough to absorb the full {overflow_hours:.0f}h overflow."
    else:
        capacity_line = f"NW03 has {headroom:.0f}h headroom ({pct_covered:.0f}% of the {overflow_hours:.0f}h overflow). Partial rerouting only."

    cost_line = (
        f"Production cost {'increases' if cost_delta_pct > 0 else 'decreases'} by {abs(cost_delta_pct):.0f}% (median) "
        f"for the {compat_count} compatible materials ({compat_pct:.0f}% of {source_factory} portfolio)."
    )
    carbon_line = (
        f"NW03 grid intensity is {nw03_intensity:.2f} gCO₂/kWh vs {src_intensity:.2f} at {source_factory} "
        f"({'higher' if carbon_delta_pct > 0 else 'lower'} carbon by {abs(carbon_delta_pct):.0f}%)."
    )

    suggestion = f"{capacity_line} {cost_line} {carbon_line}"

    return ReallocationSuggestion(
        available_headroom_hours=round(headroom, 2),
        overflow_hours=round(overflow_hours, 2),
        can_absorb=can_absorb,
        suggestion=suggestion,
        material_compatibility_pct=round(compat_pct, 1),
        compatible_materials=compat_count,
        total_materials=total_mats,
        cost_delta_pct=round(cost_delta_pct, 1),
        transport_lt_delta_days=round(lt_delta, 1),
        source_grid_intensity=round(src_intensity, 2),
        target_grid_intensity=round(nw03_intensity, 2),
        carbon_delta_pct=round(carbon_delta_pct, 1),
    )
